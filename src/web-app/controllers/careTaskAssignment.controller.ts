import type { Request, Response } from 'express'
import { Op, Sequelize, type WhereOptions } from 'sequelize'
import sequelize from '../../config/db/index.js'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import {
  CareTask,
  CareTaskAssignment,
  Resident,
  Property,
  User,
  UserDetail,
  AdditionalTaskCharge,
  Package,
  PackageSubscription,
  PackageSubscriptionFeature,
  CarePackageFeaturesMap,
  SubscriptionStatus,
  ResidentCareTaskCompletion,
} from '../../models/index.js'
import type {
  CreateCareTaskAssignmentInput,
  UpdateCareTaskAssignmentInput,
  CompleteCareTaskAssignmentInput,
} from '../../validations/careTaskAssignment.validation.js'
import { calculateMonthlyProration } from '../../utils/billingProration.util.js'

/**
 * Helper to parse price numbers safely
 */
function parsePrice(val: unknown): number {
  if (val === undefined || val === null || val === '') return 0
  const n = Number(val)
  return isNaN(n) || n < 0 ? 0 : n
}

function formatTimeTo12h(timeStr?: string | null): string {
  if (!timeStr) return '10:00 AM'
  const trimmed = timeStr.trim()
  if (/^(0?[1-9]|1[0-2]):[0-5][0-9]\s*(AM|PM)$/i.test(trimmed)) {
    return trimmed.toUpperCase()
  }
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/)
  if (!match || !match[1] || !match[2]) return trimmed
  let hours = parseInt(match[1], 10)
  const minutes = match[2]
  const meridiem = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  return `${String(hours).padStart(2, '0')}:${minutes} ${meridiem}`
}

/**
 * Ensures all care tasks bundled inside active PackageSubscriptions have corresponding
 * CareTaskAssignment rows so they appear seamlessly in the Care Tasks table.
 */
export async function syncPackageTasksForResidents(
  residentId?: string,
  locationId?: string,
  taskSchedules?: Array<{
    taskId: string
    taskName?: string
    frequency?: number
    times?: string[]
  }>,
): Promise<void> {
  try {
    // 1. Auto-heal: If any resident has carePackageId but no active subscription, create it!
    const resWhere: Record<string | symbol, unknown> = {
      carePackageId: { [Op.ne]: null },
      isDeleted: false,
    }
    if (residentId && typeof residentId === 'string') {
      resWhere.id = residentId
    } else if (locationId && typeof locationId === 'string' && locationId !== 'all' && locationId !== 'global') {
      resWhere.locId = locationId
    }

    const residentsWithPkg = await Resident.findAll({
      where: resWhere,
      attributes: ['id', 'locId', 'carePackageId', 'moveInDate'],
    })

    for (const r of residentsWithPkg) {
      if (!r.carePackageId) continue
      const activeSubForThisPkg = await PackageSubscription.findOne({
        where: {
          residentId: r.id,
          carePackageId: r.carePackageId,
          status: SubscriptionStatus.ACTIVE,
          isDeleted: false,
        },
      })
      if (!activeSubForThisPkg) {
        // Cancel & soft delete all previous package care task assignments for this resident
        await CareTaskAssignment.update(
          {
            status: 'CANCELLED',
            isStopped: true,
            stoppedAt: new Date(),
            isActive: false,
            isDeleted: true,
          },
          {
            where: {
              residentId: r.id,
              source: 'PACKAGE',
              isDeleted: false,
            },
          },
        )

        // Check if there are any existing subscriptions for this resident (e.g. stopped/inactive)
        const anySub = await PackageSubscription.findOne({
          where: { residentId: r.id, isDeleted: false },
        })
        if (anySub) {
          // Resident's package was stopped or inactive; do NOT auto-create a new active one!
          // Clear resident.carePackageId so it reflects stopped state
          await Resident.update({ carePackageId: null }, { where: { id: r.id } })
          continue
        }

        const pkg = await Package.findByPk(r.carePackageId)
        if (pkg && !pkg.isDeleted) {
          const newSub = await PackageSubscription.create({
            residentId: r.id,
            carePackageId: pkg.id,
            propertyId: r.locId,
            startDate: r.moveInDate || new Date(),
            endDate: null,
            totalCost: pkg.packageCost,
            status: SubscriptionStatus.ACTIVE,
            isPrevious: false,
            notes: `Auto-created subscription for resident care package: ${pkg.packageName}`,
          })

          const featureMaps = await CarePackageFeaturesMap.findAll({
            where: { carePackageId: pkg.id, isDeleted: false },
          })
          if (featureMaps.length > 0) {
            await PackageSubscriptionFeature.bulkCreate(
              featureMaps.map((fm) => ({
                packageSubscriptionId: newSub.id,
                featureId: fm.featureId,
                complimentaryCount: Number(fm.complimentaryCount || 0),
                remainingCount: Number(fm.complimentaryCount || 0),
              })),
            )
          }
        }
      }
    }

    // Clean up any dangling package assignments where subscription is not active
    const inactiveSubs = await PackageSubscription.findAll({
      where: {
        ...(residentId ? { residentId } : {}),
        [Op.or]: [
          { status: { [Op.ne]: SubscriptionStatus.ACTIVE } },
          { isDeleted: true },
          { endDate: { [Op.lt]: new Date() } },
        ],
      },
      attributes: ['id'],
      raw: true,
    })
    const inactiveSubIds = inactiveSubs.map((s) => s.id)

    const cleanupOrConditions: Record<string, unknown>[] = [{ packageSubscriptionId: null }]
    if (inactiveSubIds.length > 0) {
      cleanupOrConditions.push({ packageSubscriptionId: { [Op.in]: inactiveSubIds } })
    }

    await CareTaskAssignment.update(
      {
        status: 'CANCELLED',
        isStopped: true,
        stoppedAt: new Date(),
        isActive: false,
        isDeleted: true,
      },
      {
        where: {
          source: 'PACKAGE',
          isDeleted: false,
          ...(residentId ? { residentId } : {}),
          [Op.or]: cleanupOrConditions,
        },
      },
    )

    // 2. Fetch all active subscriptions and ensure care task assignments exist
    const subWhere: Record<string, unknown> = {
      status: SubscriptionStatus.ACTIVE,
      isDeleted: false,
    }
    if (residentId && typeof residentId === 'string') {
      subWhere.residentId = residentId
    } else if (locationId && typeof locationId === 'string' && locationId !== 'all' && locationId !== 'global') {
      subWhere.propertyId = locationId
    }

    const activeSubscriptions = await PackageSubscription.findAll({
      where: subWhere,
      include: [
        {
          model: PackageSubscriptionFeature,
          as: 'packageSubscriptionFeatures',
          where: { isDeleted: false },
          required: false,
        },
        {
          model: Package,
          as: 'carePackage',
          attributes: ['id', 'packageName', 'duration'],
          required: false,
        },
      ],
    })

    if (!activeSubscriptions || activeSubscriptions.length === 0) return

    for (const sub of activeSubscriptions) {
      let features = sub.packageSubscriptionFeatures || []

      // If subscription features missing, seed them from CarePackageFeaturesMap
      if (features.length === 0 && sub.carePackageId) {
        const featureMaps = await CarePackageFeaturesMap.findAll({
          where: { carePackageId: sub.carePackageId, isDeleted: false },
        })
        if (featureMaps.length > 0) {
          features = await PackageSubscriptionFeature.bulkCreate(
            featureMaps.map((fm) => ({
              packageSubscriptionId: sub.id,
              featureId: fm.featureId,
              complimentaryCount: Number(fm.complimentaryCount || 0),
              remainingCount: Number(fm.complimentaryCount || 0),
            })),
          )
        }
      }

      for (const feature of features) {
        if (!feature.featureId) continue

        const sched = taskSchedules?.find((s) => s.taskId === feature.featureId)

        // Fetch all current active package assignments for this feature & subscription
        const existingAssignments = await CareTaskAssignment.findAll({
          where: {
            residentId: sub.residentId,
            taskId: feature.featureId,
            packageSubscriptionId: sub.id,
            source: 'PACKAGE',
            isDeleted: false,
          },
        })

        // If no custom schedule was provided for this task and assignments already exist, don't alter them
        if (!sched && existingAssignments.length > 0) {
          continue
        }

        const timesToSchedule: string[] =
          sched && Array.isArray(sched.times) && sched.times.length > 0
            ? sched.times.map((t) => formatTimeTo12h(t))
            : ['10:00 AM']
        const freq = sched?.frequency || timesToSchedule.length

        // If specific schedules were explicitly provided for this task, clean up any slots not in timesToSchedule
        if (sched && sched.times && sched.times.length > 0) {
          for (const ex of existingAssignments) {
            const formattedExTime = formatTimeTo12h(ex.time)
            if (!timesToSchedule.includes(formattedExTime)) {
              await ex.update({
                status: 'CANCELLED',
                isStopped: true,
                stoppedAt: new Date(),
                isActive: false,
                isDeleted: true,
              })
            }
          }
        }

        for (const slotTime of timesToSchedule) {
          // Check if an assignment already exists for this slotTime
          const existing = existingAssignments.find((ex) => !ex.isDeleted && formatTimeTo12h(ex.time) === slotTime)

          if (existing) {
            await existing.update({
              frequency: freq,
              time: slotTime,
              status: 'ACTIVE',
              isStopped: false,
              isActive: true,
              isDeleted: false,
            })
          } else {
            await CareTaskAssignment.create({
              residentId: sub.residentId,
              taskId: feature.featureId,
              propertyId: sub.propertyId || (locationId && locationId !== 'all' ? locationId : null),
              packageSubscriptionId: sub.id,
              carePackageId: sub.carePackageId,
              source: 'PACKAGE',
              billingType: 'MONTHLY',
              price: 0,
              frequency: freq,
              startDate: sub.startDate || new Date(),
              endDate: sub.endDate || null,
              time: slotTime,
              status: 'ACTIVE',
              customInstructions:
                Number(feature.complimentaryCount) > 0
                  ? `Included in ${sub.carePackage?.packageName || 'Care Package'} (${feature.complimentaryCount} complimentary sessions)`
                  : `Included in ${sub.carePackage?.packageName || 'Care Package'} (Free / Included)`,
              isStopped: false,
              completionCount: 0,
              isActive: true,
              isDeleted: false,
            })
          }
        }
      }
    }
  } catch (err) {
    console.error('Error in syncPackageTasksForResidents:', err)
  }
}

/**
 * Get all care task assignments with filters & matrix summary
 */
export async function getAllCareTaskAssignments(req: Request, res: Response): Promise<void> {
  try {
    const { residentId, propertyId, status, billingType, source, search, isStopped, pendingOnly, targetDate } =
      req.query
    const locationId = (req.params.locationId as string) || (propertyId as string)

    // 1. Ensure any bundled care package tasks are auto-synced into assignments
    await syncPackageTasksForResidents(
      typeof residentId === 'string' ? residentId : undefined,
      typeof locationId === 'string' ? locationId : undefined,
    )

    const pageNum = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1)
    const limitNum = Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50)
    const offset = (pageNum - 1) * limitNum

    const andConditions: WhereOptions[] = [{ isDeleted: false }]

    if (residentId && typeof residentId === 'string') {
      andConditions.push({ residentId })
    }

    if (locationId && locationId !== 'all' && locationId !== 'global') {
      andConditions.push({
        [Op.or]: [{ propertyId: locationId }, { propertyId: null }],
      })
    }

    if (source && typeof source === 'string' && source !== 'ALL') {
      const normSource = source.toUpperCase()
      if (
        normSource === 'PACKAGE' ||
        normSource === 'PACKAGE_WISE' ||
        normSource === 'PACKAGE-WISE' ||
        normSource === 'PACKAGEWISE'
      ) {
        andConditions.push({ source: 'PACKAGE' })
      } else if (
        normSource === 'ADDON' ||
        normSource === 'ADD_ON' ||
        normSource === 'ADD-ON' ||
        normSource === 'ADD ON'
      ) {
        andConditions.push({ source: 'ADDON' })
      }
    }

    if (billingType && typeof billingType === 'string' && billingType !== 'ALL') {
      const bTypeUpper = billingType.toUpperCase()
      if (bTypeUpper.startsWith('MONTH')) {
        andConditions.push({ billingType: 'MONTHLY' })
      } else if (bTypeUpper.startsWith('SESS')) {
        andConditions.push({ billingType: 'SESSION' })
      } else {
        andConditions.push({ billingType })
      }
    }

    const isPending = pendingOnly === 'true' || pendingOnly === '1'

    if (isPending) {
      andConditions.push({ status: 'ACTIVE' })
      andConditions.push({ isStopped: false })

      // Task must not have expired (endDate is null represents Lifetime, or endDate >= today)
      const todayStr = new Date().toISOString().split('T')[0] as string
      const targetDateStr = typeof targetDate === 'string' && targetDate ? targetDate : todayStr

      andConditions.push({
        [Op.or]: [{ endDate: null }, { endDate: { [Op.gte]: todayStr } }],
      })

      // Task must have started on or before target date
      andConditions.push({
        startDate: { [Op.lte]: targetDateStr },
      })

      // If this specific scheduled task was completed today, hide it from today's pending list.
      // On the next day, targetDate is tomorrow, so it automatically reappears for the new day!
      andConditions.push(
        Sequelize.literal(`
          (
            (CareTaskAssignment.completedAt IS NULL OR DATE(CareTaskAssignment.completedAt) != ${sequelize.escape(targetDateStr)})
            AND NOT EXISTS (
              SELECT 1 FROM resident_care_task_completions rctc 
              WHERE rctc.residentCareTaskAssignmentId = CareTaskAssignment.id 
                AND DATE(rctc.completedAt) = ${sequelize.escape(targetDateStr)} 
                AND rctc.status = 'COMPLETED' 
                AND rctc.isDeleted = false
            )
          )
        `),
      )
    } else {
      if (status && typeof status === 'string' && status !== 'ALL') {
        andConditions.push({ status })
      }

      if (isStopped !== undefined && isStopped !== '') {
        andConditions.push({ isStopped: isStopped === 'true' || isStopped === '1' })
      }
    }

    // For PACKAGE tasks, exclude any task whose package subscription is NOT currently ACTIVE (e.g. package stopped)
    andConditions.push(
      Sequelize.literal(`
        (
          CareTaskAssignment.source != 'PACKAGE'
          OR (
            CareTaskAssignment.packageSubscriptionId IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM package_subscriptions ps
              WHERE ps.id = CareTaskAssignment.packageSubscriptionId
                AND ps.status = 'ACTIVE'
                AND ps.isDeleted = false
                AND (ps.endDate IS NULL OR DATE(ps.endDate) >= CURRENT_DATE)
            )
          )
        )
      `),
    )

    const where = { [Op.and]: andConditions }

    // Include filters for search by resident name or task name
    const residentIncludeWhere: Record<string, unknown> = { isDeleted: false }
    const taskIncludeWhere: Record<string, unknown> = { isDeleted: false }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const searchPattern = `%${search.trim()}%`
      andConditions.push({
        [Op.or]: [
          { '$resident.firstName$': { [Op.like]: searchPattern } },
          { '$resident.lastName$': { [Op.like]: searchPattern } },
          { '$task.careTaskName$': { [Op.like]: searchPattern } },
        ],
      })
    }

    const { count, rows: assignments } = await CareTaskAssignment.findAndCountAll({
      where,
      attributes: [
        'id',
        'residentId',
        'taskId',
        'propertyId',
        'packageSubscriptionId',
        'carePackageId',
        'source',
        'billingType',
        'price',
        'frequency',
        'startDate',
        'endDate',
        'time',
        'status',
        'customInstructions',
        'isStopped',
        'completionCount',
        'completedAt',
      ],
      include: [
        {
          model: Resident,
          as: 'resident',
          attributes: ['id', 'firstName', 'lastName', 'phone'],
          where: residentIncludeWhere,
          required: false,
        },
        {
          model: CareTask,
          as: 'task',
          attributes: ['id', 'careTaskName', 'billingType', 'price'],
          where: taskIncludeWhere,
          required: false,
        },
        {
          model: Property,
          as: 'property',
          attributes: ['id', 'property_name'],
          required: false,
        },
        {
          model: Package,
          as: 'carePackage',
          attributes: ['id', 'packageName'],
          required: false,
        },
        {
          model: PackageSubscription,
          as: 'packageSubscription',
          attributes: ['id', 'status', 'startDate', 'endDate'],
          required: false,
        },
      ],
      order: [
        ['createdAt', 'DESC'],
        ['startDate', 'DESC'],
      ],
      limit: limitNum,
      offset,
      distinct: true,
    })

    const totalPages = Math.ceil(count / limitNum)

    // Calculate matrix summaries (scoped to resident & location if filtered)
    const baseCountWhere: Record<string | symbol, unknown> = {
      isDeleted: false,
      [Op.and]: [
        Sequelize.literal(`
          (
            CareTaskAssignment.source != 'PACKAGE'
            OR (
              CareTaskAssignment.packageSubscriptionId IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM package_subscriptions ps
                WHERE ps.id = CareTaskAssignment.packageSubscriptionId
                  AND ps.status = 'ACTIVE'
                  AND ps.isDeleted = false
                  AND (ps.endDate IS NULL OR DATE(ps.endDate) >= CURRENT_DATE)
              )
            )
          )
        `),
      ],
    }
    if (residentId && typeof residentId === 'string') {
      baseCountWhere.residentId = residentId
    }
    if (locationId && locationId !== 'all' && locationId !== 'global') {
      baseCountWhere[Op.or] = [{ propertyId: locationId }, { propertyId: null }]
    }
    const [
      totalAllAssignments,
      totalActive,
      totalStopped,
      totalCancelled,
      totalMonthly,
      totalSessionWise,
      totalPackage,
      totalAddon,
    ] = await Promise.all([
      CareTaskAssignment.count({ where: baseCountWhere }),
      CareTaskAssignment.count({ where: { ...baseCountWhere, status: 'ACTIVE' } }),
      CareTaskAssignment.count({ where: { ...baseCountWhere, status: 'STOPPED' } }),
      CareTaskAssignment.count({ where: { ...baseCountWhere, status: 'CANCELLED' } }),
      CareTaskAssignment.count({ where: { ...baseCountWhere, billingType: 'MONTHLY' } }),
      CareTaskAssignment.count({ where: { ...baseCountWhere, billingType: 'SESSION' } }),
      CareTaskAssignment.count({ where: { ...baseCountWhere, source: 'PACKAGE' } }),
      CareTaskAssignment.count({ where: { ...baseCountWhere, source: 'ADDON' } }),
    ])

    // 2. Fetch active package subscriptions for all residents in the result set to enrich with live quota
    const residentIds = [...new Set(assignments.map((a) => a.residentId).filter(Boolean))]
    const activeSubs =
      residentIds.length > 0
        ? await PackageSubscription.findAll({
            where: {
              residentId: { [Op.in]: residentIds },
              status: SubscriptionStatus.ACTIVE,
              isDeleted: false,
            },
            include: [
              {
                model: PackageSubscriptionFeature,
                as: 'packageSubscriptionFeatures',
                where: { isDeleted: false },
                required: false,
              },
              {
                model: Package,
                as: 'carePackage',
                attributes: ['id', 'packageName', 'duration'],
                required: false,
              },
            ],
          })
        : []

    const subFeatureMap = new Map<
      string,
      {
        isIncludedInPackage: boolean
        packageName: string | null
        packageSubscriptionId?: string
        complimentaryCount: number
        remainingCount: number
        usedCount: number
        subscriptionStatus: string | null
      }
    >()

    for (const sub of activeSubs) {
      for (const feat of sub.packageSubscriptionFeatures || []) {
        subFeatureMap.set(`${sub.residentId}_${feat.featureId}`, {
          isIncludedInPackage: true,
          packageName: sub.carePackage?.packageName || 'Care Package',
          packageSubscriptionId: sub.id,
          complimentaryCount: Number(feat.complimentaryCount) || 0,
          remainingCount: Number(feat.remainingCount) || 0,
          usedCount: Math.max(0, (Number(feat.complimentaryCount) || 0) - (Number(feat.remainingCount) || 0)),
          subscriptionStatus: sub.status,
        })
      }
    }

    const enrichedAssignments = assignments
      .filter((a) => {
        // If it's a package task, double-check that its package subscription is currently active
        if (a.source === 'PACKAGE') {
          if (!a.packageSubscription || a.packageSubscription.status !== SubscriptionStatus.ACTIVE) {
            return false
          }
          if (a.packageSubscription.endDate) {
            const endD = new Date(a.packageSubscription.endDate)
            endD.setHours(23, 59, 59, 999)
            if (endD < new Date()) {
              return false
            }
          }
        }
        return true
      })
      .map((a) => {
        const json = typeof a.toJSON === 'function' ? a.toJSON() : a
        const isPkg = a.source === 'PACKAGE' && Boolean(a.packageSubscriptionId || a.carePackageId)
        const pkgInfo = isPkg
          ? subFeatureMap.get(`${a.residentId}_${a.taskId}`) || {
              isIncludedInPackage: true,
              packageName: a.carePackage?.packageName || 'Care Package',
              complimentaryCount: 0,
              remainingCount: 0,
              usedCount: 0,
              subscriptionStatus: null,
            }
          : {
              isIncludedInPackage: false,
              packageName: null,
              complimentaryCount: 0,
              remainingCount: 0,
              usedCount: 0,
              subscriptionStatus: null,
            }
        return {
          ...json,
          packageInfo: pkgInfo,
        }
      })

    // Helper to convert time strings (e.g. "08:00 AM", "12:30 PM") to minutes from midnight
    const timeToMinutes = (t?: string | null): number => {
      if (!t) return 0
      const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
      if (!m || !m[1] || !m[2]) return 0
      let hrs = parseInt(m[1], 10)
      const mins = parseInt(m[2], 10)
      const mer = m[3]?.toUpperCase()
      if (mer === 'PM' && hrs < 12) hrs += 12
      if (mer === 'AM' && hrs === 12) hrs = 0
      return hrs * 60 + mins
    }

    interface AssignmentSlotData {
      id: string
      time: string
      frequency: number
      startDate: string | Date
      endDate: string | Date | null
      status: string
      isStopped: boolean
      source: string
      rawAssignment: Record<string, unknown>
    }

    interface GroupedCareAssignment {
      groupKey: string
      residentId: string
      taskId: string
      propertyId: string | null
      source: string
      sources: string[]
      billingType: string
      price: number
      frequency: number
      startDate: string | Date
      endDate: string | Date | null
      customInstructions: string | null
      status: string
      isStopped: boolean
      totalCompletionCount?: number | undefined
      packageSubscriptionId?: string | null | undefined
      carePackageId?: string | null | undefined
      resident: {
        id: string
        firstName?: string | undefined
        lastName?: string | undefined
        phone?: string | null | undefined
      } | null
      task: {
        id: string
        careTaskName?: string | undefined
        billingType?: string | undefined
        price?: number | undefined
      } | null
      carePackage: {
        id: string
        packageName?: string | undefined
      } | null
      packageInfo: {
        isIncludedInPackage: boolean
        packageName: string | null
        complimentaryCount: number
        remainingCount: number
        usedCount: number
      } | null
      slots: AssignmentSlotData[]
      totalSlots?: number | undefined
    }

    // Build grouped tasks structure with ONLY usable keys for FE
    const groupMap = new Map<string, GroupedCareAssignment>()

    for (const item of enrichedAssignments as Array<Record<string, unknown>>) {
      const resId = String(item.residentId || '')
      const tId = String(item.taskId || '')
      const groupKey = `${resId}_${tId}`

      const taskObj = item.task as Record<string, unknown> | undefined
      const resObj = item.resident as Record<string, unknown> | undefined
      const pkgObj = item.carePackage as Record<string, unknown> | undefined
      const pkgInfoObj = item.packageInfo as Record<string, unknown> | undefined

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          groupKey,
          residentId: resId,
          taskId: tId,
          propertyId: (item.propertyId as string | null) || null,
          source: String(item.source || 'ADDON'),
          sources: [String(item.source || 'ADDON')],
          billingType: String(item.billingType || 'SESSION'),
          price: Number(item.price || 0),
          frequency: Number(item.frequency || 1),
          startDate: item.startDate as string | Date,
          endDate: (item.endDate as string | Date | null) || null,
          customInstructions: (item.customInstructions as string | null) || null,
          status: String(item.status || 'ACTIVE'),
          isStopped: Boolean(item.isStopped),
          totalCompletionCount: 0,
          resident: resObj
            ? {
                id: String(resObj.id || ''),
                firstName: resObj.firstName ? String(resObj.firstName) : undefined,
                lastName: resObj.lastName ? String(resObj.lastName) : undefined,
                phone: (resObj.phone as string | null) || null,
              }
            : null,
          task: taskObj
            ? {
                id: String(taskObj.id || ''),
                careTaskName: taskObj.careTaskName ? String(taskObj.careTaskName) : undefined,
                billingType: taskObj.billingType ? String(taskObj.billingType) : 'SESSION',
                price: Number(taskObj.price || 0),
              }
            : null,
          carePackage: pkgObj
            ? {
                id: String(pkgObj.id || ''),
                packageName: pkgObj.packageName ? String(pkgObj.packageName) : undefined,
              }
            : null,
          packageInfo: pkgInfoObj
            ? {
                isIncludedInPackage: Boolean(pkgInfoObj.isIncludedInPackage),
                packageName: (pkgInfoObj.packageName as string | null) || null,
                complimentaryCount: Number(pkgInfoObj.complimentaryCount || 0),
                remainingCount: Number(pkgInfoObj.remainingCount || 0),
                usedCount: Number(pkgInfoObj.usedCount || 0),
              }
            : null,
          slots: [],
        })
      } else {
        const existingGroup = groupMap.get(groupKey)!
        const currentSource = String(item.source || 'ADDON')
        if (currentSource && !existingGroup.sources.includes(currentSource)) {
          existingGroup.sources.push(currentSource)
        }
        if (currentSource === 'PACKAGE' || pkgInfoObj?.isIncludedInPackage) {
          existingGroup.source = 'PACKAGE'
          if (pkgInfoObj) {
            existingGroup.packageInfo = {
              isIncludedInPackage: Boolean(pkgInfoObj.isIncludedInPackage),
              packageName: (pkgInfoObj.packageName as string | null) || null,
              complimentaryCount: Number(pkgInfoObj.complimentaryCount || 0),
              remainingCount: Number(pkgInfoObj.remainingCount || 0),
              usedCount: Number(pkgInfoObj.usedCount || 0),
            }
          }
          if (pkgObj) {
            existingGroup.carePackage = {
              id: String(pkgObj.id || ''),
              packageName: pkgObj.packageName ? String(pkgObj.packageName) : undefined,
            }
          }
          existingGroup.packageSubscriptionId =
            (item.packageSubscriptionId as string | null | undefined) ?? existingGroup.packageSubscriptionId
          existingGroup.carePackageId = (item.carePackageId as string | null | undefined) ?? existingGroup.carePackageId
        }
        if (!existingGroup.customInstructions && item.customInstructions) {
          existingGroup.customInstructions = String(item.customInstructions)
        }
      }

      const group = groupMap.get(groupKey)!
      group.totalCompletionCount = (group.totalCompletionCount || 0) + Number(item.completionCount || 0)
      if (item.frequency && Number(item.frequency) > group.frequency) {
        group.frequency = Number(item.frequency)
      }

      const slotTime = String(item.time || '12:00 PM')
      const existingSlotIndex = group.slots.findIndex((s: AssignmentSlotData) => s.time === slotTime)

      const slotData: AssignmentSlotData = {
        id: String(item.id || ''),
        time: slotTime,
        frequency: Number(item.frequency || 1),
        startDate: item.startDate as string | Date,
        endDate: (item.endDate as string | Date | null) || null,
        status: String(item.status || 'ACTIVE'),
        isStopped: Boolean(item.isStopped),
        source: String(item.source || 'ADDON'),
        rawAssignment: {
          id: item.id,
          residentId: item.residentId,
          taskId: item.taskId,
          source: item.source,
          billingType: item.billingType || 'SESSION',
          price: Number(item.price || 0),
          status: item.status || 'ACTIVE',
          isStopped: Boolean(item.isStopped),
          packageSubscriptionId: item.packageSubscriptionId || null,
          carePackageId: item.carePackageId || null,
          packageInfo: pkgInfoObj
            ? {
                isIncludedInPackage: Boolean(pkgInfoObj.isIncludedInPackage),
                packageName: pkgInfoObj.packageName || null,
                complimentaryCount: Number(pkgInfoObj.complimentaryCount || 0),
                remainingCount: Number(pkgInfoObj.remainingCount || 0),
                usedCount: Number(pkgInfoObj.usedCount || 0),
              }
            : null,
          task: taskObj
            ? {
                id: taskObj.id,
                careTaskName: taskObj.careTaskName,
                price: Number(taskObj.price || 0),
                billingType: taskObj.billingType || 'SESSION',
              }
            : null,
          resident: resObj
            ? {
                id: resObj.id,
                firstName: resObj.firstName,
                lastName: resObj.lastName,
              }
            : null,
        },
      }

      if (existingSlotIndex >= 0) {
        const existingSlot = group.slots[existingSlotIndex]
        if (existingSlot && item.source === 'PACKAGE' && existingSlot.source !== 'PACKAGE') {
          group.slots[existingSlotIndex] = slotData
        }
      } else {
        group.slots.push(slotData)
      }
    }

    const groupedAssignments = Array.from(groupMap.values()).map((group) => {
      group.slots.sort((a: AssignmentSlotData, b: AssignmentSlotData) => timeToMinutes(a.time) - timeToMinutes(b.time))
      group.totalSlots = group.slots.length
      return group
    })

    res.status(200).json({
      success: true,
      data: groupedAssignments,
      grouped: groupedAssignments,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages,
      },
      matrix: {
        totalAssignments: totalAllAssignments,
        totalActive,
        totalStopped,
        totalCancelled,
        totalMonthly,
        totalSessionWise,
        totalPackage,
        totalAddon,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch care task assignments'
    res.status(500).json({ success: false, message })
  }
}

/**
 * Get a single care task assignment by ID
 */
export async function getCareTaskAssignmentById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const assignment = await CareTaskAssignment.findOne({
      where: { id, isDeleted: false },
      include: [
        {
          model: Resident,
          as: 'resident',
          attributes: ['id', 'firstName', 'lastName', 'phone', 'locId', 'unitId'],
          required: false,
        },
        {
          model: CareTask,
          as: 'task',
          attributes: ['id', 'careTaskName', 'careTaskDescription', 'billingType', 'price', 'careTaskImage'],
          required: false,
        },
        {
          model: Property,
          as: 'property',
          attributes: ['id', 'property_name', 'city', 'state'],
          required: false,
        },
        {
          model: User,
          as: 'nurse',
          attributes: ['id', 'email', 'phone', 'username'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
          required: false,
        },
        {
          model: AdditionalTaskCharge,
          as: 'charges',
          where: { isDeleted: false },
          required: false,
        },
        {
          model: Package,
          as: 'carePackage',
          attributes: ['id', 'packageName', 'duration'],
          required: false,
        },
        {
          model: PackageSubscription,
          as: 'packageSubscription',
          attributes: ['id', 'status', 'startDate', 'endDate'],
          required: false,
        },
        {
          model: ResidentCareTaskCompletion,
          as: 'completions',
          where: { isDeleted: false },
          required: false,
          include: [
            {
              model: User,
              as: 'completedByUser',
              attributes: ['id', 'email', 'phone', 'username'],
              include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
            },
          ],
        },
      ],
    })

    if (!assignment) {
      res.status(404).json({ success: false, message: 'Care task assignment not found' })
      return
    }

    // Enrich with package subscription quota details only if part of an active package
    const isPkg =
      assignment.source === 'PACKAGE' && Boolean(assignment.packageSubscriptionId || assignment.carePackageId)
    let packageInfo: {
      isIncludedInPackage: boolean
      packageName: string | null
      packageSubscriptionId?: string | null
      complimentaryCount: number
      remainingCount: number
      usedCount: number
      subscriptionStatus: string | null
      isPackageStopped: boolean
    } = {
      isIncludedInPackage: false,
      packageName: null,
      complimentaryCount: 0,
      remainingCount: 0,
      usedCount: 0,
      subscriptionStatus: null,
      isPackageStopped: false,
    }

    if (isPkg) {
      const activeSub = await PackageSubscription.findOne({
        where: {
          residentId: assignment.residentId,
          status: SubscriptionStatus.ACTIVE,
          isDeleted: false,
        },
        include: [
          {
            model: PackageSubscriptionFeature,
            as: 'packageSubscriptionFeatures',
            where: { featureId: assignment.taskId, isDeleted: false },
            required: false,
          },
          {
            model: Package,
            as: 'carePackage',
            attributes: ['id', 'packageName', 'duration'],
            required: false,
          },
        ],
      })

      const matchingFeature = activeSub?.packageSubscriptionFeatures?.[0]
      if (matchingFeature && activeSub) {
        packageInfo = {
          isIncludedInPackage: true,
          packageName: activeSub.carePackage?.packageName || 'Care Package',
          packageSubscriptionId: activeSub.id,
          complimentaryCount: Number(matchingFeature.complimentaryCount) || 0,
          remainingCount: Number(matchingFeature.remainingCount) || 0,
          usedCount: Math.max(
            0,
            (Number(matchingFeature.complimentaryCount) || 0) - (Number(matchingFeature.remainingCount) || 0),
          ),
          subscriptionStatus: activeSub.status,
          isPackageStopped: false,
        }
      } else {
        packageInfo = {
          isIncludedInPackage: true,
          packageName: assignment.carePackage?.packageName || 'Care Package',
          packageSubscriptionId: assignment.packageSubscriptionId,
          complimentaryCount: 0,
          remainingCount: 0,
          usedCount: 0,
          subscriptionStatus: 'INACTIVE',
          isPackageStopped: true,
        }
      }
    }

    const assignmentJson = typeof assignment.toJSON === 'function' ? assignment.toJSON() : assignment
    res.status(200).json({ success: true, data: { ...assignmentJson, packageInfo } })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch care task assignment'
    res.status(500).json({ success: false, message })
  }
}

/**
 * Assign a Care Task to a Resident
 */
export async function createCareTaskAssignment(req: Request, res: Response): Promise<void> {
  try {
    const body = (req as Request & { validatedBody?: CreateCareTaskAssignmentInput }).validatedBody || req.body
    const operatingUserId = (req as AuthenticatedRequest).user?.id || null

    const {
      residentId,
      taskId,
      billingType,
      startDate,
      customInstructions,
      nurseId,
      source,
      packageSubscriptionId,
      carePackageId,
    } = body

    // 1. Verify resident exists
    const resident = await Resident.findByPk(residentId)
    if (!resident || resident.isDeleted) {
      res.status(404).json({ success: false, message: 'Specified resident not found' })
      return
    }

    // 2. Verify care task exists
    const task = await CareTask.findByPk(taskId)
    if (!task || task.isDeleted) {
      res.status(404).json({ success: false, message: 'Specified care task not found' })
      return
    }

    // 3. Normalize billing category (inherit automatically from task if not provided)
    const effectiveBillingType = billingType || task.billingType || 'MONTHLY'
    const bTypeUpper = String(effectiveBillingType).toUpperCase()
    let normalizedBillingType: 'MONTHLY' | 'SESSION' = 'MONTHLY'
    if (bTypeUpper.startsWith('SESS')) {
      normalizedBillingType = 'SESSION'
    } else {
      normalizedBillingType = 'MONTHLY'
    }

    // Resolve price based on billing category (inherit automatically from task if not provided)
    let finalPrice = parsePrice(body.price)
    if (finalPrice === 0) {
      finalPrice = Number(task.price) || 0
    }

    // 4. Resolve times list and frequency
    const timesList: string[] = []
    if (Array.isArray(body.times) && body.times.length > 0) {
      for (const t of body.times) {
        if (t && typeof t === 'string' && t.trim()) {
          timesList.push(t.trim())
        }
      }
    } else if (body.time && typeof body.time === 'string' && body.time.trim()) {
      timesList.push(body.time.trim())
    } else {
      timesList.push('12:00 PM')
    }

    let frequency: number | null = null
    if (body.frequency !== undefined && body.frequency !== null && body.frequency !== '') {
      const rawFreq = Number(body.frequency)
      frequency = isNaN(rawFreq) || rawFreq < 1 ? timesList.length : Math.floor(rawFreq)
    } else {
      frequency = timesList.length
    }

    // 5. Resolve source: 'PACKAGE' | 'ADDON'
    const normalizedSource: 'PACKAGE' | 'ADDON' =
      source && String(source).toUpperCase() === 'PACKAGE' && Boolean(packageSubscriptionId) ? 'PACKAGE' : 'ADDON'

    // 6. Resolve property ID
    const propertyId = body.propertyId || resident.locId || null

    const createdAssignments = []

    for (const scheduledTime of timesList) {
      const newAssignment = await CareTaskAssignment.create({
        residentId,
        taskId,
        propertyId,
        packageSubscriptionId: normalizedSource === 'PACKAGE' ? packageSubscriptionId || null : null,
        carePackageId: normalizedSource === 'PACKAGE' ? carePackageId || null : null,
        source: normalizedSource,
        nurseId: nurseId || null,
        billingType: normalizedBillingType,
        price: finalPrice,
        frequency,
        startDate: (String(startDate).split('T')[0] as string) || String(startDate),
        endDate: body.endDate ? String(body.endDate).split('T')[0] : null,
        time: scheduledTime,
        status: 'ACTIVE',
        customInstructions: customInstructions ? String(customInstructions).trim() : null,
        isStopped: false,
        completionCount: 0,
        isActive: true,
        isDeleted: false,
        createdBy: operatingUserId,
        updatedBy: operatingUserId,
      })

      const loaded = await CareTaskAssignment.findByPk(newAssignment.id, {
        include: [
          {
            model: Resident,
            as: 'resident',
            attributes: ['id', 'firstName', 'lastName', 'phone', 'locId', 'unitId'],
          },
          {
            model: CareTask,
            as: 'task',
            attributes: ['id', 'careTaskName', 'careTaskDescription', 'billingType', 'price', 'careTaskImage'],
          },
          {
            model: Property,
            as: 'property',
            attributes: ['id', 'property_name', 'city', 'state'],
          },
          {
            model: User,
            as: 'nurse',
            attributes: ['id', 'email', 'phone', 'username'],
            include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
          },
          {
            model: Package,
            as: 'carePackage',
            attributes: ['id', 'packageName', 'duration'],
          },
          {
            model: PackageSubscription,
            as: 'packageSubscription',
            attributes: ['id', 'status', 'startDate', 'endDate'],
          },
        ],
      })
      createdAssignments.push(loaded || newAssignment)
    }

    res.status(201).json({
      success: true,
      message:
        createdAssignments.length > 1
          ? `Successfully created ${createdAssignments.length} care task assignments for scheduled times.`
          : 'Care task assigned to resident successfully',
      data: createdAssignments[0],
      assignments: createdAssignments,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to assign care task'
    res.status(500).json({ success: false, message })
  }
}

/**
 * Complete Care Task Assignment
 * (Mirrors Rely-Assist complimentary deduction & AdditionalTaskCharge generation)
 */
export async function completeCareTask(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id || req.body.assignmentId
    const body = (req as Request & { validatedBody?: CompleteCareTaskAssignmentInput }).validatedBody || req.body
    const operatingUserId = (req as AuthenticatedRequest).user?.id || null

    const assignment = await CareTaskAssignment.findOne({
      where: { id, isDeleted: false },
      include: [
        {
          model: CareTask,
          as: 'task',
        },
        {
          model: Resident,
          as: 'resident',
        },
      ],
    })

    if (!assignment) {
      res.status(404).json({ success: false, message: 'Care task assignment not found' })
      return
    }

    if (assignment.isStopped || assignment.status === 'STOPPED' || assignment.status === 'CANCELLED') {
      res.status(400).json({ success: false, message: 'Cannot complete a stopped or cancelled care task assignment' })
      return
    }

    // Directly record current date & time on BE
    const completionDate = new Date()
    let completingNurseId = body.nurseId || operatingUserId || assignment.nurseId
    if (completingNurseId) {
      const validUser = await User.findByPk(completingNurseId)
      if (!validUser) {
        completingNurseId = null
      }
    }
    if (!completingNurseId) {
      const fallbackUser = await User.findOne({ where: { isActive: true, isDeleted: false } })
      completingNurseId = fallbackUser?.id || null
    }

    let quotaDeducted = false
    let charged = false
    let remainingComplimentary: number | null = null
    let chargeRecord: AdditionalTaskCharge | null = null

    // ── Check active package subscription for complimentary deduction ONLY if assignment is a PACKAGE task ──
    const isPackageAssignment =
      assignment.source === 'PACKAGE' && Boolean(assignment.packageSubscriptionId || assignment.carePackageId)

    const activeSubscription = isPackageAssignment
      ? await PackageSubscription.findOne({
          where: {
            id: assignment.packageSubscriptionId || undefined,
            residentId: assignment.residentId,
            status: SubscriptionStatus.ACTIVE,
            isDeleted: false,
          },
          include: [
            {
              model: Package,
              as: 'carePackage',
              attributes: ['id', 'packageName'],
              required: false,
            },
          ],
          order: [['createdAt', 'DESC']],
        })
      : null

    if (isPackageAssignment && !activeSubscription) {
      res.status(400).json({
        success: false,
        message: 'The care package for this task has been stopped or is inactive. This task cannot be completed.',
      })
      return
    }

    let subFeature: PackageSubscriptionFeature | null = null

    if (activeSubscription) {
      // Find the subscription feature for this care task
      subFeature = await PackageSubscriptionFeature.findOne({
        where: {
          packageSubscriptionId: activeSubscription.id,
          featureId: assignment.taskId,
          isDeleted: false,
        },
      })

      if (subFeature) {
        const currentRemaining = Number(subFeature.remainingCount) || 0

        if (currentRemaining > 0) {
          // Case 1: Deduct from complimentary quota
          const newRemaining = Math.max(0, currentRemaining - 1)
          await subFeature.update({
            remainingCount: newRemaining,
            updatedBy: operatingUserId,
          })
          quotaDeducted = true
          remainingComplimentary = newRemaining
        } else {
          // Case 2: Complimentary quota exhausted -> Generate AdditionalTaskCharge
          const taskPrice =
            Number(assignment.price) > 0 ? Number(assignment.price) : Number(assignment.task?.price || 0)

          if (taskPrice > 0 && completingNurseId) {
            chargeRecord = await AdditionalTaskCharge.create({
              residentId: assignment.residentId,
              featureId: assignment.taskId,
              nurseId: completingNurseId,
              price: taskPrice,
              unitPrice: taskPrice,
              taskName: assignment.task?.careTaskName || 'Care Task',
              description: body.notes || 'Exhausted package complimentary quota. Charged session fee.',
              completedAt: completionDate,
              taskAssignmentId: assignment.id,
              isActive: true,
              isDeleted: false,
              createdBy: operatingUserId,
              updatedBy: operatingUserId,
            })
            charged = true
          }
          remainingComplimentary = 0
        }
      } else {
        // Case 3: Task is not in the resident's subscribed package -> Generate AdditionalTaskCharge
        const isMonthly = (assignment.billingType || assignment.task?.billingType || '')
          .toUpperCase()
          .startsWith('MONTH')
        const taskPrice = Number(assignment.price) > 0 ? Number(assignment.price) : Number(assignment.task?.price || 0)

        if (completingNurseId) {
          if (isMonthly) {
            const startOfMonth = new Date(completionDate.getFullYear(), completionDate.getMonth(), 1, 0, 0, 0, 0)
            const endOfMonth = new Date(completionDate.getFullYear(), completionDate.getMonth() + 1, 0, 23, 59, 59, 999)
            const monthLabel = completionDate.toLocaleString('default', { month: 'short', year: 'numeric' })
            const billingMonth = `${completionDate.getFullYear()}-${String(completionDate.getMonth() + 1).padStart(2, '0')}`

            const existingCharge = await AdditionalTaskCharge.findOne({
              where: {
                taskAssignmentId: assignment.id,
                isDeleted: false,
                price: { [Op.gt]: 0 },
                completedAt: {
                  [Op.between]: [startOfMonth, endOfMonth],
                },
              },
            })

            if (!existingCharge) {
              const proration = calculateMonthlyProration({
                monthlyPrice: taskPrice,
                startDate:
                  (assignment.startDate ? String(assignment.startDate).split('T')[0] : null) || `${billingMonth}-01`,
                endDate: assignment.endDate ? String(assignment.endDate).split('T')[0] || null : null,
                billingMonth,
              })

              if (proration.amount > 0) {
                const desc =
                  body.notes ||
                  body.description ||
                  (proration.isProrated
                    ? `Direct add-on monthly fee (${monthLabel} - ${proration.activeDays}/${proration.daysInMonth} days prorated).`
                    : `Direct add-on monthly fee (${monthLabel}).`)

                chargeRecord = await AdditionalTaskCharge.create({
                  residentId: assignment.residentId,
                  featureId: assignment.taskId,
                  nurseId: completingNurseId,
                  price: proration.amount,
                  unitPrice: taskPrice,
                  taskName: assignment.task?.careTaskName || 'Care Task',
                  description: desc,
                  completedAt: completionDate,
                  taskAssignmentId: assignment.id,
                  isActive: true,
                  isDeleted: false,
                  createdBy: operatingUserId,
                  updatedBy: operatingUserId,
                })
                charged = true
              } else {
                charged = false
              }
            } else {
              // Covered under existing monthly fee, price is 0 -> do not insert
              charged = false
            }
          } else {
            // SESSION billing type: each and every completed session is charged per-session rate
            if (taskPrice > 0) {
              chargeRecord = await AdditionalTaskCharge.create({
                residentId: assignment.residentId,
                featureId: assignment.taskId,
                nurseId: completingNurseId,
                price: taskPrice,
                unitPrice: taskPrice,
                taskName: assignment.task?.careTaskName || 'Care Task',
                description:
                  body.notes || body.description || 'Direct session charge (task not included in active package).',
                completedAt: completionDate,
                taskAssignmentId: assignment.id,
                isActive: true,
                isDeleted: false,
                createdBy: operatingUserId,
                updatedBy: operatingUserId,
              })
              charged = true
            } else {
              charged = false
            }
          }
        }
      }
    } else {
      // Case 4: Direct Add-on Task or no active package subscription
      const isMonthly = (assignment.billingType || assignment.task?.billingType || '').toUpperCase().startsWith('MONTH')
      const taskPrice = Number(assignment.price) > 0 ? Number(assignment.price) : Number(assignment.task?.price || 0)

      if (completingNurseId) {
        if (isMonthly) {
          const startOfMonth = new Date(completionDate.getFullYear(), completionDate.getMonth(), 1, 0, 0, 0, 0)
          const endOfMonth = new Date(completionDate.getFullYear(), completionDate.getMonth() + 1, 0, 23, 59, 59, 999)
          const monthLabel = completionDate.toLocaleString('default', { month: 'short', year: 'numeric' })
          const billingMonth = `${completionDate.getFullYear()}-${String(completionDate.getMonth() + 1).padStart(2, '0')}`

          const existingCharge = await AdditionalTaskCharge.findOne({
            where: {
              taskAssignmentId: assignment.id,
              isDeleted: false,
              price: { [Op.gt]: 0 },
              completedAt: {
                [Op.between]: [startOfMonth, endOfMonth],
              },
            },
          })

          if (!existingCharge) {
            const proration = calculateMonthlyProration({
              monthlyPrice: taskPrice,
              startDate:
                (assignment.startDate ? String(assignment.startDate).split('T')[0] : null) || `${billingMonth}-01`,
              endDate: assignment.endDate ? String(assignment.endDate).split('T')[0] || null : null,
              billingMonth,
            })

            if (proration.amount > 0) {
              const desc =
                body.notes ||
                body.description ||
                (proration.isProrated
                  ? `Direct add-on monthly fee (${monthLabel} - ${proration.activeDays}/${proration.daysInMonth} days prorated).`
                  : `Direct add-on monthly fee (${monthLabel}).`)

              chargeRecord = await AdditionalTaskCharge.create({
                residentId: assignment.residentId,
                featureId: assignment.taskId,
                nurseId: completingNurseId,
                price: proration.amount,
                unitPrice: taskPrice,
                taskName: assignment.task?.careTaskName || 'Care Task',
                description: desc,
                completedAt: completionDate,
                taskAssignmentId: assignment.id,
                isActive: true,
                isDeleted: false,
                createdBy: operatingUserId,
                updatedBy: operatingUserId,
              })
              charged = true
            } else {
              charged = false
            }
          } else {
            // Covered under existing monthly fee, price is 0 -> do not insert
            charged = false
          }
        } else {
          // SESSION billing type: each and every completed session is charged per-session rate
          if (taskPrice > 0) {
            chargeRecord = await AdditionalTaskCharge.create({
              residentId: assignment.residentId,
              featureId: assignment.taskId,
              nurseId: completingNurseId,
              price: taskPrice,
              unitPrice: taskPrice,
              taskName: assignment.task?.careTaskName || 'Care Task',
              description: body.notes || body.description || 'Direct add-on session fee.',
              completedAt: completionDate,
              taskAssignmentId: assignment.id,
              isActive: true,
              isDeleted: false,
              createdBy: operatingUserId,
              updatedBy: operatingUserId,
            })
            charged = true
          } else {
            charged = false
          }
        }
      }
    }

    // ── Update assignment record ──
    const nextCount = (assignment.completionCount || 0) + 1
    await assignment.update({
      completionCount: nextCount,
      completedAt: completionDate,
      completedBy: completingNurseId,
      updatedBy: operatingUserId,
    })

    const updatedAssignment = await CareTaskAssignment.findByPk(assignment.id, {
      include: [
        {
          model: Resident,
          as: 'resident',
          attributes: ['id', 'firstName', 'lastName', 'phone', 'locId', 'unitId'],
        },
        {
          model: CareTask,
          as: 'task',
          attributes: ['id', 'careTaskName', 'careTaskDescription', 'billingType', 'price', 'careTaskImage'],
        },
        {
          model: User,
          as: 'completedByUser',
          attributes: ['id', 'email', 'phone', 'username'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
        },
      ],
    })

    let message = 'Care task completed successfully.'
    if (quotaDeducted) {
      message = `Care task completed successfully. Used 1 complimentary quota (${remainingComplimentary} remaining).`
    } else if (charged && chargeRecord) {
      message = `Care task completed successfully. Quota exhausted/not included — billed ₹${chargeRecord.price}.`
    }

    const packageInfo = subFeature
      ? {
          isIncludedInPackage: true,
          packageName: activeSubscription?.carePackage?.packageName || 'Care Package',
          packageSubscriptionId: activeSubscription?.id,
          complimentaryCount: Number(subFeature.complimentaryCount) || 0,
          remainingCount: Number(subFeature.remainingCount) || 0,
          usedCount: Math.max(
            0,
            (Number(subFeature.complimentaryCount) || 0) - (Number(subFeature.remainingCount) || 0),
          ),
          subscriptionStatus: activeSubscription?.status,
        }
      : {
          isIncludedInPackage: false,
          packageName: null,
          complimentaryCount: 0,
          remainingCount: 0,
          usedCount: 0,
          subscriptionStatus: null,
        }

    const updatedAssignmentJson =
      typeof updatedAssignment?.toJSON === 'function' ? updatedAssignment.toJSON() : updatedAssignment

    // ── Create ResidentCareTaskCompletion Record ──
    const completionRecord = await ResidentCareTaskCompletion.create({
      residentCareTaskAssignmentId: assignment.id,
      residentId: assignment.residentId,
      taskId: assignment.taskId,
      propertyId: assignment.propertyId || null,
      completedBy: completingNurseId || null,
      completedAt: completionDate,
      status: 'COMPLETED',
      description:
        body.description ||
        body.notes ||
        (quotaDeducted
          ? `Complimentary quota deducted (${remainingComplimentary} remaining)`
          : charged
            ? 'Exhausted quota / extra session charge'
            : 'Care task completed'),
      remarks: body.remarks || body.notes || null,
      isActive: true,
      isDeleted: false,
      createdBy: operatingUserId,
      updatedBy: operatingUserId,
    })

    res.status(200).json({
      success: true,
      message,
      data: {
        ...(updatedAssignmentJson || {}),
        assignment: updatedAssignmentJson,
        packageInfo,
        quotaDeducted,
        charged,
        remainingComplimentary,
        chargeRecord,
        completionRecord,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to complete care task'
    res.status(500).json({ success: false, message })
  }
}

/**
 * Get Resident Care Task Completions (audit log & history)
 */
export async function getCareTaskCompletions(req: Request, res: Response): Promise<void> {
  try {
    const { assignmentId, residentId, taskId, propertyId, status, startDate, endDate, search, source } = req.query
    const locationId = (req.params.locationId as string) || (propertyId as string)
    const pageNum = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1)
    const limitNum = Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50)
    const offset = (pageNum - 1) * limitNum

    const andConditions: Record<string, unknown>[] = [{ isDeleted: false }]

    const targetAssignmentId = (req.params.id as string) || (assignmentId as string)
    if (targetAssignmentId) {
      andConditions.push({ residentCareTaskAssignmentId: targetAssignmentId })
    }

    if (residentId && typeof residentId === 'string') {
      andConditions.push({ residentId })
    }

    if (taskId && typeof taskId === 'string') {
      andConditions.push({ taskId })
    }

    if (locationId && locationId !== 'all' && locationId !== 'global') {
      andConditions.push({
        [Op.or]: [{ propertyId: locationId }, { propertyId: null }],
      })
    }

    if (status && typeof status === 'string' && status !== 'ALL') {
      andConditions.push({ status: status.toUpperCase() })
    }

    const assignmentIncludeWhere: Record<string, unknown> = { isDeleted: false }
    if (source && typeof source === 'string' && source !== 'ALL') {
      const normSource = source.toUpperCase()
      if (
        normSource === 'PACKAGE' ||
        normSource === 'PACKAGE_WISE' ||
        normSource === 'PACKAGE-WISE' ||
        normSource === 'PACKAGEWISE'
      ) {
        assignmentIncludeWhere.source = 'PACKAGE'
      } else if (
        normSource === 'ADDON' ||
        normSource === 'ADD_ON' ||
        normSource === 'ADD-ON' ||
        normSource === 'ADD ON'
      ) {
        assignmentIncludeWhere.source = 'ADDON'
      }
    }

    if (startDate) {
      andConditions.push({ completedAt: { [Op.gte]: new Date(String(startDate)) } })
    }

    if (endDate) {
      andConditions.push({ completedAt: { [Op.lte]: new Date(String(endDate)) } })
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const searchPattern = `%${search.trim()}%`
      andConditions.push({
        [Op.or]: [
          { '$resident.firstName$': { [Op.like]: searchPattern } },
          { '$resident.lastName$': { [Op.like]: searchPattern } },
          { '$task.careTaskName$': { [Op.like]: searchPattern } },
          { '$completedByUser.username$': { [Op.like]: searchPattern } },
          { remarks: { [Op.like]: searchPattern } },
          { description: { [Op.like]: searchPattern } },
        ],
      })
    }

    const { count, rows: completions } = await ResidentCareTaskCompletion.findAndCountAll({
      where: { [Op.and]: andConditions },
      include: [
        {
          model: Resident,
          as: 'resident',
          attributes: ['id', 'firstName', 'lastName', 'phone'],
          required: false,
        },
        {
          model: CareTask,
          as: 'task',
          attributes: ['id', 'careTaskName', 'billingType', 'price', 'careTaskImage'],
          required: false,
        },
        {
          model: User,
          as: 'completedByUser',
          attributes: ['id', 'email', 'phone', 'username'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
          required: false,
        },
        {
          model: Property,
          as: 'property',
          attributes: ['id', 'property_name', 'city', 'state'],
          required: false,
        },
        {
          model: CareTaskAssignment,
          as: 'assignment',
          where: assignmentIncludeWhere,
          attributes: [
            'id',
            'source',
            'billingType',
            'price',
            'time',
            'startDate',
            'endDate',
            'carePackageId',
            'packageSubscriptionId',
          ],
          include: [
            {
              model: Package,
              as: 'carePackage',
              attributes: ['id', 'packageName', 'duration'],
              required: false,
            },
          ],
          required: Boolean(source && source !== 'ALL'),
        },
      ],
      order: [['completedAt', 'DESC']],

      limit: limitNum,
      offset,
      distinct: true,
    })

    res.status(200).json({
      success: true,
      data: completions,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch care task completions'
    res.status(500).json({ success: false, message })
  }
}

/**
 * Stop a Care Task Assignment
 */
export async function stopCareTaskAssignment(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const operatingUserId = (req as AuthenticatedRequest).user?.id || null

    const assignment = await CareTaskAssignment.findOne({
      where: { id, isDeleted: false },
    })

    if (!assignment) {
      res.status(404).json({ success: false, message: 'Care task assignment not found' })
      return
    }

    await assignment.update({
      isStopped: true,
      status: 'STOPPED',
      stoppedAt: new Date(),
      stoppedBy: operatingUserId,
      updatedBy: operatingUserId,
    })

    res.status(200).json({
      success: true,
      message: 'Care task assignment stopped successfully',
      data: assignment,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to stop care task assignment'
    res.status(500).json({ success: false, message })
  }
}

/**
 * Update an existing Care Task Assignment
 */
export async function updateCareTaskAssignment(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const body = (req as Request & { validatedBody?: UpdateCareTaskAssignmentInput }).validatedBody || req.body
    const operatingUserId = (req as AuthenticatedRequest).user?.id || null

    const assignment = await CareTaskAssignment.findOne({
      where: { id, isDeleted: false },
    })

    if (!assignment) {
      res.status(404).json({ success: false, message: 'Care task assignment not found' })
      return
    }

    const updates: Partial<Record<string, unknown>> = {
      updatedBy: operatingUserId,
    }

    if (body.frequency !== undefined && body.frequency !== null) {
      const f = Math.max(1, parseInt(String(body.frequency), 10) || 1)
      updates.frequency = f
    }

    if (body.startDate !== undefined) {
      updates.startDate = String(body.startDate).split('T')[0]
    }

    if (body.endDate !== undefined) {
      updates.endDate = body.endDate ? String(body.endDate).split('T')[0] : null
    }

    if (body.time !== undefined) {
      updates.time = String(body.time).trim()
    }

    if (body.nurseId !== undefined) {
      updates.nurseId = body.nurseId || null
    }

    if (body.customInstructions !== undefined) {
      updates.customInstructions = body.customInstructions ? String(body.customInstructions).trim() : null
    }

    if (body.status !== undefined) {
      updates.status = body.status
      if (body.status === 'STOPPED' || body.status === 'CANCELLED') {
        updates.isStopped = true
        updates.stoppedAt = new Date()
        updates.stoppedBy = operatingUserId
      } else if (body.status === 'ACTIVE') {
        updates.isStopped = false
        updates.stoppedAt = null
        updates.stoppedBy = null
      }
    }

    if (body.source !== undefined && body.source !== null) {
      updates.source = String(body.source).toUpperCase() === 'PACKAGE' ? 'PACKAGE' : 'ADDON'
    }

    if (body.billingType !== undefined && body.billingType !== null) {
      const bUpper = String(body.billingType).toUpperCase()
      updates.billingType = bUpper.startsWith('SESS') ? 'SESSION' : 'MONTHLY'
    }

    if (body.price !== undefined && body.price !== null) {
      updates.price = parsePrice(body.price)
    }

    await assignment.update(updates)

    const updatedAssignment = await CareTaskAssignment.findByPk(assignment.id, {
      include: [
        {
          model: Resident,
          as: 'resident',
          attributes: ['id', 'firstName', 'lastName', 'phone', 'locId', 'unitId'],
        },
        {
          model: CareTask,
          as: 'task',
          attributes: ['id', 'careTaskName', 'careTaskDescription', 'billingType', 'price', 'careTaskImage'],
        },
      ],
    })

    res.status(200).json({
      success: true,
      message: 'Care task assignment updated successfully',
      data: updatedAssignment,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update care task assignment'
    res.status(500).json({ success: false, message })
  }
}

/**
 * Soft delete a Care Task Assignment
 */
export async function deleteCareTaskAssignment(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const operatingUserId = (req as AuthenticatedRequest).user?.id || null

    const assignment = await CareTaskAssignment.findOne({
      where: { id, isDeleted: false },
    })

    if (!assignment) {
      res.status(404).json({ success: false, message: 'Care task assignment not found' })
      return
    }

    await assignment.update({
      isDeleted: true,
      isActive: false,
      updatedBy: operatingUserId,
    })

    res.status(200).json({
      success: true,
      message: 'Care task assignment deleted successfully',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete care task assignment'
    res.status(500).json({ success: false, message })
  }
}

/**
 * Cancel a Care Task Assignment
 */
export async function cancelCareTaskAssignment(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const operatingUserId = (req as AuthenticatedRequest).user?.id || null

    const assignment = await CareTaskAssignment.findOne({
      where: { id, isDeleted: false },
    })

    if (!assignment) {
      res.status(404).json({ success: false, message: 'Care task assignment not found' })
      return
    }

    await assignment.update({
      isStopped: true,
      status: 'CANCELLED',
      stoppedAt: new Date(),
      stoppedBy: operatingUserId,
      updatedBy: operatingUserId,
    })

    res.status(200).json({
      success: true,
      message: 'Care task assignment cancelled successfully',
      data: assignment,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to cancel care task assignment'
    res.status(500).json({ success: false, message })
  }
}
