import type { Request, Response } from 'express'
import { Op, Sequelize, type WhereOptions } from 'sequelize'
import sequelize from '../../../config/db/index.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import {
  CareTask,
  CareTaskAssignment,
  Package,
  PackageSubscription,
  PackageSubscriptionFeature,
  Property,
  PropertyBlock,
  PropertyFloor,
  PropertyUnit,
  Resident,
  ResidentCareTaskCompletion,
  ResidentFamilyMember,
  SubscriptionStatus,
  User,
  UserDetail,
  UserLocation,
} from '../../../models/index.js'
import {
  completeCareTask,
  syncPackageTasksForResidents,
} from '../../../web-app/controllers/careTaskAssignment.controller.js'

/**
 * Resolves the location/property ID for the current request.
 * Priority:
 * 1. Query / Header propertyId or locationId
 * 2. req.user.defaultLocationId (from JWT token)
 * 3. UserLocation table for the authenticated user
 * 4. User table defaultLocationId
 */
export async function resolveUserLocationId(req: AuthenticatedRequest): Promise<string | null> {
  const queryLoc = (req.query.propertyId ||
    req.query.locationId ||
    req.headers['x-property-id'] ||
    req.headers['x-location-id']) as string | undefined

  if (queryLoc && queryLoc !== 'all' && queryLoc !== 'global') {
    return queryLoc.trim()
  }

  if (req.user?.defaultLocationId) {
    return req.user.defaultLocationId
  }

  if (req.user?.id) {
    const userLoc = await UserLocation.findOne({
      where: { userId: req.user.id, isActive: true, isDeleted: false },
      attributes: ['locId'],
    })
    if (userLoc?.locId) {
      return userLoc.locId
    }

    const dbUser = await User.findByPk(req.user.id, {
      attributes: ['id', 'defaultLocationId'],
    })
    if (dbUser?.defaultLocationId) {
      return dbUser.defaultLocationId
    }
  }

  return null
}

/**
 * Helper to convert time strings (e.g. "08:00 AM", "12:30 PM") to minutes from midnight
 */
function timeToMinutes(t?: string | null): number {
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

/**
 * Format a time string safely to standard AM/PM format
 */
function formatTime12h(timeStr?: string | null): string {
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

interface AssignmentSlotData {
  id: string
  time: string
  frequency: number
  startDate: string | Date
  endDate: string | Date | null
  status: string
  isStopped: boolean
  source: string
  completionCount: number
  completedAt?: Date | string | null
  customInstructions?: string | null
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
  totalCompletionCount: number
  totalSlots: number
  resident: {
    id: string
    firstName?: string
    lastName?: string
    phone?: string | null
    unitId?: string | null
    unitNumber?: string | null
    blockName?: string | null
  } | null
  task: {
    id: string
    careTaskName?: string
    careTaskDescription?: string | null
    billingType?: string
    price?: number
    careTaskImage?: string | null
  } | null
  property: {
    id: string
    property_name?: string
  } | null
  carePackage: {
    id: string
    packageName?: string
  } | null
  packageInfo: {
    isIncludedInPackage: boolean
    packageName: string | null
    complimentaryCount: number
    remainingCount: number
    usedCount: number
    subscriptionStatus: string | null
  } | null
  slots: AssignmentSlotData[]
}

// ══════════════════════════════════════════════════════════════════════════════
// NURSE CARE TASK HANDLERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/mobile/l3/medical/care-tasks
 * Location-wise care tasks with support for Two Tabs: Pending Tasks & Completed Tasks.
 */
export async function getNurseCareTasks(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest
    const locationId = await resolveUserLocationId(authReq)
    const rawTab = String(req.query.tab || 'PENDING').toUpperCase()
    const activeTab = rawTab === 'COMPLETED' ? 'COMPLETED' : rawTab === 'ALL' ? 'ALL' : 'PENDING'
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''

    const todayStr = new Date().toISOString().split('T')[0] as string
    const targetDateStr =
      typeof req.query.targetDate === 'string' && req.query.targetDate ? req.query.targetDate : todayStr

    // 1. Ensure any bundled care package tasks are auto-synced
    if (locationId) {
      await syncPackageTasksForResidents(undefined, locationId)
    }

    // 2. Base Location Condition
    const locationWhere: WhereOptions = locationId
      ? {
          [Op.or]: [
            { propertyId: locationId },
            { propertyId: null },
            Sequelize.literal(
              `EXISTS (SELECT 1 FROM residents r WHERE r.id = CareTaskAssignment.residentId AND r.locId = ${sequelize.escape(locationId)})`,
            ),
          ],
        }
      : {}

    // 3. Build Pending Conditions
    const pendingAndConditions: WhereOptions[] = [
      { isDeleted: false },
      { status: 'ACTIVE' },
      { isStopped: false },
      {
        [Op.or]: [{ endDate: null }, { endDate: { [Op.gte]: todayStr } }],
      },
      {
        startDate: { [Op.lte]: targetDateStr },
      },
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
    ]

    if (locationId) {
      pendingAndConditions.push(locationWhere)
    }

    // 4. Calculate Pending and Completed counts for the header badges
    const pendingCount = await CareTaskAssignment.count({
      where: { [Op.and]: pendingAndConditions },
    })

    const targetNurseId = (req.query.nurseId as string) || authReq.user?.id || null

    const completedCountWhere: Record<string | symbol, unknown> = {
      isDeleted: false,
      status: 'COMPLETED',
      ...(targetNurseId ? { completedBy: targetNurseId } : {}),
      ...(locationId
        ? {
            [Op.or]: [
              { propertyId: locationId },
              { propertyId: null },
              Sequelize.literal(
                `EXISTS (SELECT 1 FROM residents r WHERE r.id = ResidentCareTaskCompletion.residentId AND r.locId = ${sequelize.escape(locationId)})`,
              ),
            ],
          }
        : {}),
    }

    const completedCount = await ResidentCareTaskCompletion.count({
      where: completedCountWhere,
    })

    // ── If Tab is PENDING ──
    if (activeTab === 'PENDING') {
      if (search) {
        const searchPattern = `%${search}%`
        pendingAndConditions.push({
          [Op.or]: [
            { '$resident.firstName$': { [Op.like]: searchPattern } },
            { '$resident.lastName$': { [Op.like]: searchPattern } },
            { '$task.careTaskName$': { [Op.like]: searchPattern } },
          ],
        })
      }

      const assignments = await CareTaskAssignment.findAll({
        where: { [Op.and]: pendingAndConditions },
        include: [
          {
            model: Resident,
            as: 'resident',
            attributes: ['id', 'firstName', 'lastName', 'phone', 'locId', 'unitId'],
            where: { isDeleted: false },
            required: false,
            include: [
              {
                model: PropertyUnit,
                as: 'unit',
                attributes: ['id', 'unit_number', 'floorId'],
                required: false,
                include: [
                  {
                    model: PropertyFloor,
                    as: 'floor',
                    attributes: ['id', 'floor_name', 'blockId'],
                    required: false,
                    include: [
                      {
                        model: PropertyBlock,
                        as: 'block',
                        attributes: ['id', 'block_name'],
                        required: false,
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            model: CareTask,
            as: 'task',
            attributes: ['id', 'careTaskName', 'careTaskDescription', 'billingType', 'price', 'careTaskImage'],
            where: { isDeleted: false },
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
      })

      // Fetch package subscription features for complimentary quota
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
                  attributes: ['id', 'packageName'],
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

      // Group assignments by resident & task
      const groupMap = new Map<string, GroupedCareAssignment>()

      for (const a of assignments) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const json = typeof a.toJSON === 'function' ? a.toJSON() : (a as any)
        const resId = String(json.residentId || '')
        const tId = String(json.taskId || '')
        const groupKey = `${resId}_${tId}`

        const taskObj = json.task
        const resObj = json.resident
        const pkgObj = json.carePackage
        const isPkg = json.source === 'PACKAGE' && Boolean(json.packageSubscriptionId || json.carePackageId)
        const pkgInfo = isPkg
          ? subFeatureMap.get(`${resId}_${tId}`) || {
              isIncludedInPackage: true,
              packageName: pkgObj?.packageName || 'Care Package',
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

        if (!groupMap.has(groupKey)) {
          const unitObj = resObj?.unit
          const floorObj = unitObj?.floor
          const blockObj = floorObj?.block
          const unitNumber = unitObj?.unit_number || null
          const blockName = blockObj?.block_name || null

          groupMap.set(groupKey, {
            groupKey,
            residentId: resId,
            taskId: tId,
            propertyId: json.propertyId || null,
            source: String(json.source || 'ADDON'),
            sources: [String(json.source || 'ADDON')],
            billingType: String(json.billingType || 'SESSION'),
            price: Number(json.price || 0),
            frequency: Number(json.frequency || 1),
            startDate: json.startDate,
            endDate: json.endDate || null,
            customInstructions: json.customInstructions || null,
            status: String(json.status || 'ACTIVE'),
            isStopped: Boolean(json.isStopped),
            totalCompletionCount: 0,
            totalSlots: 0,
            resident: resObj
              ? {
                  id: resObj.id,
                  firstName: resObj.firstName,
                  lastName: resObj.lastName,
                  phone: resObj.phone || null,
                  unitId: resObj.unitId || null,
                  unitNumber,
                  blockName,
                }
              : null,
            task: taskObj
              ? {
                  id: taskObj.id,
                  careTaskName: taskObj.careTaskName,
                  careTaskDescription: taskObj.careTaskDescription || null,
                  billingType: taskObj.billingType || 'SESSION',
                  price: Number(taskObj.price || 0),
                  careTaskImage: taskObj.careTaskImage || null,
                }
              : null,
            property: json.property
              ? {
                  id: json.property.id,
                  property_name: json.property.property_name,
                }
              : null,
            carePackage: pkgObj
              ? {
                  id: pkgObj.id,
                  packageName: pkgObj.packageName,
                }
              : null,
            packageInfo: pkgInfo,
            slots: [],
          })
        } else {
          const existingGroup = groupMap.get(groupKey)!
          const curSource = String(json.source || 'ADDON')
          if (!existingGroup.sources.includes(curSource)) {
            existingGroup.sources.push(curSource)
          }
          if (curSource === 'PACKAGE' || pkgInfo.isIncludedInPackage) {
            existingGroup.source = 'PACKAGE'
            existingGroup.packageInfo = pkgInfo
            if (pkgObj) existingGroup.carePackage = { id: pkgObj.id, packageName: pkgObj.packageName }
          }
          if (!existingGroup.customInstructions && json.customInstructions) {
            existingGroup.customInstructions = json.customInstructions
          }
        }

        const group = groupMap.get(groupKey)!
        group.totalCompletionCount += Number(json.completionCount || 0)
        if (json.frequency && Number(json.frequency) > group.frequency) {
          group.frequency = Number(json.frequency)
        }

        const slotTime = String(json.time || '12:00 PM')
        const existingSlotIdx = group.slots.findIndex((s) => s.time === slotTime)

        const slotData: AssignmentSlotData = {
          id: String(json.id),
          time: slotTime,
          frequency: Number(json.frequency || 1),
          startDate: json.startDate,
          endDate: json.endDate || null,
          status: String(json.status || 'ACTIVE'),
          isStopped: Boolean(json.isStopped),
          source: String(json.source || 'ADDON'),
          completionCount: Number(json.completionCount || 0),
          completedAt: json.completedAt || null,
          customInstructions: json.customInstructions || null,
          rawAssignment: json,
        }

        if (existingSlotIdx >= 0) {
          if (json.source === 'PACKAGE' && group.slots[existingSlotIdx]?.source !== 'PACKAGE') {
            group.slots[existingSlotIdx] = slotData
          }
        } else {
          group.slots.push(slotData)
        }
      }

      const groupedAssignments = Array.from(groupMap.values()).map((group) => {
        group.slots.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))
        group.totalSlots = group.slots.length
        return group
      })

      res.status(200).json({
        success: true,
        tab: 'PENDING',
        locationId,
        counts: {
          pending: pendingCount,
          completed: completedCount,
        },
        data: groupedAssignments,
        grouped: groupedAssignments,
      })
      return
    }

    // ── If Tab is COMPLETED ──
    const completedAndConditions: WhereOptions[] = [
      { isDeleted: false },
      { status: 'COMPLETED' },
      ...(targetNurseId ? [{ completedBy: targetNurseId }] : []),
    ]

    if (locationId) {
      completedAndConditions.push({
        [Op.or]: [
          { propertyId: locationId },
          { propertyId: null },
          Sequelize.literal(
            `EXISTS (SELECT 1 FROM residents r WHERE r.id = ResidentCareTaskCompletion.residentId AND r.locId = ${sequelize.escape(locationId)})`,
          ),
        ],
      })
    }

    if (search) {
      const searchPattern = `%${search}%`
      completedAndConditions.push({
        [Op.or]: [
          { '$resident.firstName$': { [Op.like]: searchPattern } },
          { '$resident.lastName$': { [Op.like]: searchPattern } },
          { '$task.careTaskName$': { [Op.like]: searchPattern } },
        ],
      })
    }

    const completions = await ResidentCareTaskCompletion.findAll({
      where: { [Op.and]: completedAndConditions },
      include: [
        {
          model: Resident,
          as: 'resident',
          attributes: ['id', 'firstName', 'lastName', 'phone', 'locId', 'unitId'],
          required: false,
          include: [
            {
              model: PropertyUnit,
              as: 'unit',
              attributes: ['id', 'unit_number', 'floorId'],
              required: false,
              include: [
                {
                  model: PropertyFloor,
                  as: 'floor',
                  attributes: ['id', 'floor_name', 'blockId'],
                  required: false,
                  include: [
                    {
                      model: PropertyBlock,
                      as: 'block',
                      attributes: ['id', 'block_name'],
                      required: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          model: CareTask,
          as: 'task',
          attributes: ['id', 'careTaskName', 'careTaskDescription', 'billingType', 'price', 'careTaskImage'],
          required: false,
        },
        {
          model: User,
          as: 'completedByUser',
          attributes: ['id', 'email', 'phone', 'username'],
          required: false,
          include: [
            {
              model: UserDetail,
              as: 'profile',
              attributes: ['firstName', 'lastName', 'phone'],
              required: false,
            },
          ],
        },
        {
          model: CareTaskAssignment,
          as: 'assignment',
          attributes: [
            'id',
            'time',
            'frequency',
            'source',
            'billingType',
            'price',
            'startDate',
            'endDate',
            'customInstructions',
          ],
          required: false,
        },
        {
          model: Property,
          as: 'property',
          attributes: ['id', 'property_name'],
          required: false,
        },
      ],
      order: [['completedAt', 'DESC']],
      limit: 100,
    })

    const formattedCompletions = completions.map((c) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = typeof c.toJSON === 'function' ? c.toJSON() : (c as any)
      const resObj = json.resident
      const unitObj = resObj?.unit
      const floorObj = unitObj?.floor
      const blockObj = floorObj?.block
      const nurseProfile = json.completedByUser?.profile
      const nurseName = nurseProfile?.firstName
        ? `${nurseProfile.firstName} ${nurseProfile.lastName || ''}`.trim()
        : json.completedByUser?.username || 'Nurse'

      return {
        id: json.id,
        assignmentId: json.residentCareTaskAssignmentId,
        residentId: json.residentId,
        taskId: json.taskId,
        propertyId: json.propertyId || locationId,
        completedAt: json.completedAt,
        status: json.status || 'COMPLETED',
        description: json.description,
        notes: json.notes,
        nurseId: json.completedBy,
        nurseName,
        time: json.assignment?.time || '12:00 PM',
        source: json.assignment?.source || 'ADDON',
        billingType: json.assignment?.billingType || json.task?.billingType || 'SESSION',
        resident: resObj
          ? {
              id: resObj.id,
              firstName: resObj.firstName,
              lastName: resObj.lastName,
              phone: resObj.phone || null,
              unitNumber: unitObj?.unit_number || null,
              blockName: blockObj?.block_name || null,
            }
          : null,
        task: json.task
          ? {
              id: json.task.id,
              careTaskName: json.task.careTaskName,
              billingType: json.task.billingType || 'SESSION',
              price: Number(json.task.price || 0),
              careTaskImage: json.task.careTaskImage || null,
            }
          : null,
      }
    })

    res.status(200).json({
      success: true,
      tab: 'COMPLETED',
      locationId,
      counts: {
        pending: pendingCount,
        completed: completedCount,
      },
      data: formattedCompletions,
    })
  } catch (error) {
    console.error('Error fetching nurse care tasks:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch nurse care tasks',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

/**
 * POST /api/v1/mobile/l3/medical/care-tasks/:id/complete
 * Complete a care task assignment for the nurse.
 */
export async function completeNurseCareTask(req: Request, res: Response): Promise<void> {
  try {
    const assignmentId = req.params.id || req.body?.id || req.body?.assignmentId
    if (!assignmentId) {
      res.status(400).json({
        success: false,
        message: 'Care task assignment ID is required.',
      })
      return
    }

    req.params.id = String(assignmentId)
    if (!req.body) req.body = {}
    req.body.assignmentId = assignmentId

    const authReq = req as AuthenticatedRequest
    if (authReq.user?.id) {
      req.body.nurseId = authReq.user.id
    }

    // Delegate to completeCareTask handler from careTaskAssignment.controller
    await completeCareTask(req, res)
  } catch (error) {
    console.error('Error completing nurse care task:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to complete care task',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DOCTOR CARE TASK & RESIDENT HANDLERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/mobile/l3/medical/doctor/residents
 * Also alias: GET /api/v1/mobile/l3/medical/residents
 * Fetches residents assigned to the Doctor's property/location with basic details,
 * unit information, care package status, and count of active care tasks.
 */
export async function getDoctorResidents(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest
    const locId = await resolveUserLocationId(authReq)
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''

    const andConditions: WhereOptions[] = [{ isDeleted: false }]

    if (locId && locId !== 'all' && locId !== 'global') {
      andConditions.push({ locId })
    }

    if (search) {
      const escaped = sequelize.escape(`%${search}%`)
      andConditions.push({
        [Op.or]: [
          { firstName: { [Op.like]: `%${search}%` } },
          { lastName: { [Op.like]: `%${search}%` } },
          { phone: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } },
          Sequelize.literal(
            `EXISTS (SELECT 1 FROM property_units pu WHERE pu.id = Resident.unitId AND pu.unit_number LIKE ${escaped})`,
          ),
        ],
      })
    }

    const where = { [Op.and]: andConditions }
    const total = await Resident.count({ where })

    const isAll = req.query.limit === 'all' || req.query.all === 'true'
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10))
    const limit = isAll ? total || 10 : Math.max(1, Math.min(100, parseInt(String(req.query.limit || '10'), 10)))
    const totalPages = isAll ? 1 : Math.max(1, Math.ceil(total / limit))
    const safePage = isAll ? 1 : Math.min(page, totalPages)
    const offset = isAll ? 0 : (safePage - 1) * limit

    const residents = await Resident.findAll({
      where,
      include: [
        {
          model: Property,
          as: 'property',
          attributes: ['id', 'property_name', 'city', 'state'],
          required: false,
        },
        {
          model: PropertyUnit,
          as: 'unit',
          attributes: ['id', 'unit_number', 'unit_type', 'floorId'],
          include: [
            {
              model: PropertyFloor,
              as: 'floor',
              attributes: ['id', 'floor_number', 'floor_name', 'blockId'],
              include: [
                {
                  model: PropertyBlock,
                  as: 'block',
                  attributes: ['id', 'block_name'],
                  required: false,
                },
              ],
              required: false,
            },
          ],
          required: false,
        },
        {
          model: Package,
          as: 'carePackage',
          attributes: ['id', 'packageName', 'duration'],
          required: false,
        },
        {
          model: CareTaskAssignment,
          as: 'careTaskAssignments',
          where: { isDeleted: false, status: 'ACTIVE', isStopped: false },
          attributes: ['id'],
          required: false,
        },
      ],
      order: [
        ['firstName', 'ASC'],
        ['lastName', 'ASC'],
      ],
      ...(isAll ? {} : { limit, offset }),
    })

    const formattedResidents = residents.map((r) => {
      const unit = r.unit as
        | (PropertyUnit & {
            floor?: (PropertyFloor & { block?: PropertyBlock | null }) | null
          })
        | null
        | undefined

      const activeAssignments = (r.careTaskAssignments || []) as unknown as Array<{ id: string }>

      return {
        id: r.id,
        firstName: r.firstName,
        lastName: r.lastName || '',
        fullName: `${r.firstName} ${r.lastName || ''}`.trim(),
        gender: r.gender || null,
        dob: r.dob || null,
        phone: r.phone || null,
        email: r.email || null,
        emergencyContact: r.emergencyContact || null,
        bloodGroup: r.bloodGroup || null,
        photoUrl: r.photoUrl || null,
        moveInDate: r.moveInDate || null,
        locId: r.locId,
        property: r.property
          ? {
              id: r.property.id,
              name: r.property.property_name,
              city: r.property.city,
            }
          : null,
        unit: unit
          ? {
              id: unit.id,
              unitNumber: unit.unit_number,
              unitType: unit.unit_type,
              floorNumber: unit.floor?.floor_number ?? null,
              floorName: unit.floor?.floor_name ?? null,
              blockName: unit.floor?.block?.block_name ?? null,
            }
          : null,
        carePackage: r.carePackage
          ? {
              id: r.carePackage.id,
              name: r.carePackage.packageName,
              duration: r.carePackage.duration,
            }
          : null,
        activeTasksCount: activeAssignments.length,
      }
    })

    const paginationData = {
      page: safePage,
      limit: isAll ? total : limit,
      total,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPrevPage: safePage > 1,
    }

    res.status(200).json({
      success: true,
      message: 'Location residents fetched successfully',
      data: formattedResidents,
      pagination: paginationData,
      total,
      locationId: locId,
    })
  } catch (error) {
    console.error('Error fetching doctor residents:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch location residents'
    res.status(500).json({ success: false, message })
  }
}

/**
 * GET /api/v1/mobile/l3/medical/doctor/residents/:id
 * Also alias: GET /api/v1/mobile/l3/medical/residents/:id
 * Returns complete resident profile, medical details, emergency contact,
 * unit and room data, family members, active package subscription,
 * and count of active care tasks.
 */
export async function getDoctorResidentDetails(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params
    if (!id) {
      res.status(400).json({ success: false, message: 'Resident ID is required' })
      return
    }

    const resident = await Resident.findOne({
      where: { id, isDeleted: false },
      include: [
        {
          model: Property,
          as: 'property',
          attributes: ['id', 'property_name', 'city', 'state'],
          required: false,
        },
        {
          model: PropertyUnit,
          as: 'unit',
          attributes: [
            'id',
            'unit_number',
            'unit_type',
            'carpet_area',
            'built_up_area',
            'super_built_up_area',
            'direction',
            'view_facing',
            'occupancyStatus',
            'floorId',
          ],
          include: [
            {
              model: PropertyFloor,
              as: 'floor',
              attributes: ['id', 'floor_number', 'floor_name', 'blockId'],
              include: [
                {
                  model: PropertyBlock,
                  as: 'block',
                  attributes: ['id', 'block_name'],
                  required: false,
                },
              ],
              required: false,
            },
          ],
          required: false,
        },
        {
          model: ResidentFamilyMember,
          as: 'familyMembers',
          where: { isDeleted: false },
          required: false,
        },
        {
          model: Package,
          as: 'carePackage',
          required: false,
        },
        {
          model: PackageSubscription,
          as: 'packageSubscriptions',
          where: { isDeleted: false, status: SubscriptionStatus.ACTIVE },
          required: false,
          include: [
            {
              model: PackageSubscriptionFeature,
              as: 'packageSubscriptionFeatures',
              required: false,
            },
          ],
        },
      ],
    })

    if (!resident) {
      res.status(404).json({ success: false, message: 'Resident not found' })
      return
    }

    const unit = resident.unit as
      | (PropertyUnit & {
          floor?: (PropertyFloor & { block?: PropertyBlock | null }) | null
        })
      | null
      | undefined

    const activeTasksCount = await CareTaskAssignment.count({
      where: {
        residentId: id,
        isDeleted: false,
        status: 'ACTIVE',
        isStopped: false,
      },
    })

    const firstSub = resident.packageSubscriptions?.[0]

    const formattedResident = {
      id: resident.id,
      firstName: resident.firstName,
      lastName: resident.lastName || '',
      fullName: `${resident.firstName} ${resident.lastName || ''}`.trim(),
      gender: resident.gender || 'Not specified',
      dob: resident.dob || null,
      phone: resident.phone || null,
      email: resident.email || null,
      emergencyContact: resident.emergencyContact || null,
      bloodGroup: resident.bloodGroup || 'Not specified',
      photoUrl: resident.photoUrl || null,
      moveInDate: resident.moveInDate || null,
      residentType: resident.residentType,
      ownershipType: resident.ownershipType,
      isResiding: resident.isResiding,
      locId: resident.locId,
      property: resident.property
        ? {
            id: resident.property.id,
            name: resident.property.property_name,
            city: resident.property.city,
            state: resident.property.state,
          }
        : null,
      unit: unit
        ? {
            id: unit.id,
            unitNumber: unit.unit_number,
            unitType: unit.unit_type,
            direction: unit.direction,
            viewFacing: unit.view_facing,
            occupancyStatus: unit.occupancyStatus,
            floorNumber: unit.floor?.floor_number ?? null,
            floorName: unit.floor?.floor_name ?? null,
            blockName: unit.floor?.block?.block_name ?? null,
          }
        : null,
      familyMembers: (resident.familyMembers || []).map((fm) => ({
        id: fm.id,
        name: `${fm.firstName} ${fm.lastName || ''}`.trim(),
        relation: fm.relation,
        phone: fm.phone,
        email: fm.email,
      })),
      carePackage: resident.carePackage
        ? {
            id: resident.carePackage.id,
            name: resident.carePackage.packageName,
            duration: resident.carePackage.duration,
            packageCost: resident.carePackage.packageCost,
            description: resident.carePackage.description,
          }
        : null,
      activeSubscription: firstSub
        ? {
            id: firstSub.id,
            status: firstSub.status,
            startDate: firstSub.startDate,
            endDate: firstSub.endDate,
          }
        : null,
      activeTasksCount,
      careTaskAssignments: {
        activeCount: activeTasksCount,
        stoppedCount: 0,
        active: [],
        all: [],
      },
    }

    res.status(200).json({
      success: true,
      message: 'Resident details fetched successfully',
      data: formattedResident,
    })
  } catch (error) {
    console.error('Error fetching resident details:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch resident details'
    res.status(500).json({ success: false, message })
  }
}

/**
 * GET /api/v1/mobile/l3/medical/care-task/assignments
 * GET /api/v1/mobile/l3/medical/care-task/assignments/:residentId
 * Also aliases:
 * GET /api/v1/mobile/l3/medical/care-tasks/assignments
 * GET /api/v1/mobile/l3/medical/care-tasks/assignments/:residentId
 *
 * Dedicated and optimized endpoint for care task assignments of a resident.
 * Supports status filtering ('PENDING' | 'COMPLETED' | 'ALL') and pagination.
 */
export async function getDoctorResidentCareTasks(req: Request, res: Response): Promise<void> {
  try {
    const residentId = (req.params.residentId ||
      req.params.id ||
      req.query.residentId ||
      req.query.resident_id) as string
    if (!residentId) {
      res.status(400).json({ success: false, message: 'Resident ID is required' })
      return
    }

    const rawStatus = String(req.query.status || req.query.tab || 'ALL').toUpperCase()
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10))
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '5'), 10)))

    // Fetch active assignments for this resident
    const assignments = await CareTaskAssignment.findAll({
      where: {
        residentId,
        isDeleted: false,
        status: 'ACTIVE',
        isStopped: false,
      },
      include: [
        {
          model: CareTask,
          as: 'task',
          attributes: ['id', 'careTaskName', 'careTaskDescription', 'billingType', 'price', 'careTaskImage'],
          required: false,
        },
        {
          model: User,
          as: 'nurse',
          attributes: ['id', 'username', 'email', 'phone'],
          include: [
            {
              model: UserDetail,
              as: 'profile',
              attributes: ['firstName', 'lastName'],
              required: false,
            },
          ],
          required: false,
        },
        {
          model: ResidentCareTaskCompletion,
          as: 'completions',
          where: { isDeleted: false },
          order: [['completedAt', 'DESC']],
          required: false,
          include: [
            {
              model: User,
              as: 'completedByUser',
              attributes: ['id', 'username', 'email'],
              include: [
                {
                  model: UserDetail,
                  as: 'profile',
                  attributes: ['firstName', 'lastName'],
                  required: false,
                },
              ],
              required: false,
            },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
    })

    const mappedAssignments = assignments.map((a) => {
      const nurseProfile = a.nurse?.profile
      const nurseName = nurseProfile
        ? `${nurseProfile.firstName} ${nurseProfile.lastName || ''}`.trim()
        : a.nurse?.username || null

      const completionsList = (a.completions || []) as unknown as Array<
        ResidentCareTaskCompletion & {
          completedByUser?: User & { profile?: UserDetail }
        }
      >

      const validCompletions = completionsList.filter((c) => c.status === 'COMPLETED')
      const latestCompletion = validCompletions[0] || null
      const isCompleted = !!latestCompletion
      const taskStatus: 'COMPLETED' | 'PENDING' = isCompleted ? 'COMPLETED' : 'PENDING'

      const compUser = latestCompletion?.completedByUser
      const compProfile = compUser?.profile
      const completedByName = compProfile
        ? `${compProfile.firstName || ''} ${compProfile.lastName || ''}`.trim()
        : compUser?.username || (isCompleted ? 'Staff Nurse' : null)

      return {
        id: a.id,
        taskId: a.taskId,
        taskName: a.task?.careTaskName || 'Care Task',
        description: a.task?.careTaskDescription || null,
        billingType: a.billingType,
        price: Number(a.price) || 0,
        frequency: a.frequency || 1,
        time: formatTime12h(a.time),
        startDate: a.startDate,
        endDate: a.endDate,
        source: a.source,
        status: a.status,
        taskStatus,
        isCompleted,
        completedByName,
        completedAt: latestCompletion?.completedAt || null,
        completionRemarks: latestCompletion?.remarks || latestCompletion?.description || null,
        customInstructions: a.customInstructions || null,
        nurseId: a.nurseId || null,
        nurseName,
        completionCount: a.completionCount || (validCompletions.length > 0 ? validCompletions.length : 0),
        recentCompletions: completionsList.map((c) => {
          const u = c.completedByUser
          const p = u?.profile
          const byName = p ? `${p.firstName || ''} ${p.lastName || ''}`.trim() : u?.username || null
          return {
            id: c.id,
            completedAt: c.completedAt,
            status: c.status,
            remarks: c.remarks || c.description || null,
            completedBy: c.completedBy,
            completedByName: byName,
          }
        }),
      }
    })

    const pendingCount = mappedAssignments.filter((t) => t.taskStatus === 'PENDING').length
    const completedCount = mappedAssignments.filter((t) => t.taskStatus === 'COMPLETED').length
    const totalCount = mappedAssignments.length

    let filtered = mappedAssignments
    if (rawStatus === 'PENDING') {
      filtered = mappedAssignments.filter((t) => t.taskStatus === 'PENDING')
    } else if (rawStatus === 'COMPLETED') {
      filtered = mappedAssignments.filter((t) => t.taskStatus === 'COMPLETED')
    }

    const total = filtered.length
    const totalPages = Math.max(1, Math.ceil(total / limit))
    const safePage = Math.min(page, totalPages)
    const startIndex = (safePage - 1) * limit
    const paginated = filtered.slice(startIndex, startIndex + limit)

    res.status(200).json({
      success: true,
      message: 'Resident care task assignments fetched successfully',
      data: paginated,
      counts: {
        pending: pendingCount,
        completed: completedCount,
        total: totalCount,
      },
      pagination: {
        page: safePage,
        limit,
        total,
        totalPages,
        hasNextPage: safePage < totalPages,
        hasPrevPage: safePage > 1,
      },
      residentId,
      status: rawStatus,
    })
  } catch (error) {
    console.error('Error fetching resident care tasks:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch resident care tasks'
    res.status(500).json({ success: false, message })
  }
}

/**
 * GET /api/v1/mobile/l3/medical/care-tasks/templates
 * Also aliases: /care-tasks/definitions, /care-tasks/available
 * Returns available care task master items so the Doctor can easily assign a task.
 */
export async function getAvailableCareTasks(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest
    const locId = await resolveUserLocationId(authReq)
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''

    const andConditions: WhereOptions[] = [{ isDeleted: false }, { isActive: true }]

    if (locId && locId !== 'all' && locId !== 'global') {
      andConditions.push({
        [Op.or]: [{ propertyId: locId }, { propertyId: null }],
      })
    }

    if (search) {
      const q = `%${search}%`
      andConditions.push({
        [Op.or]: [{ careTaskName: { [Op.like]: q } }, { careTaskDescription: { [Op.like]: q } }],
      })
    }

    const where = { [Op.and]: andConditions }
    const total = await CareTask.count({ where })

    const isAll = req.query.limit === 'all' || req.query.all === 'true'
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10))
    const limit = isAll ? total || 10 : Math.max(1, Math.min(100, parseInt(String(req.query.limit || '10'), 10)))
    const totalPages = isAll ? 1 : Math.max(1, Math.ceil(total / limit))
    const safePage = isAll ? 1 : Math.min(page, totalPages)
    const offset = isAll ? 0 : (safePage - 1) * limit

    // 1. Fetch Care Task Master items
    const careTasks = await CareTask.findAll({
      where,
      attributes: ['id', 'careTaskName', 'careTaskDescription', 'billingType', 'price', 'careTaskImage', 'propertyId'],
      order: [['careTaskName', 'ASC']],
      ...(isAll ? {} : { limit, offset }),
    })

    const formattedTasks = careTasks.map((t) => ({
      id: t.id,
      careTaskName: t.careTaskName,
      careTaskDescription: t.careTaskDescription,
      billingType: t.billingType,
      price: Number(t.price) || 0,
      careTaskImage: t.careTaskImage,
      propertyId: t.propertyId,
    }))

    const paginationData = {
      page: safePage,
      limit: isAll ? total : limit,
      total,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPrevPage: safePage > 1,
    }

    res.status(200).json({
      success: true,
      message: 'Available care tasks fetched successfully',
      data: {
        careTasks: formattedTasks,
        locationId: locId,
        pagination: paginationData,
      },
      pagination: paginationData,
      total,
    })
  } catch (error) {
    console.error('Error fetching available care tasks:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch care tasks'
    res.status(500).json({ success: false, message })
  }
}

/**
 * POST /api/v1/mobile/l3/medical/care-tasks/assign
 * Also alias: POST /api/v1/mobile/l3/medical/care-tasks
 * Doctor assigns a care task to a resident with schedule time slots, frequency,
 * start/end date, custom instructions, and optional assigned nurse.
 */
export async function assignDoctorCareTask(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest
    const operatingUserId = authReq.user?.id || null
    const {
      residentId,
      taskId,
      startDate,
      endDate,
      frequency,
      time,
      times,
      customInstructions,
      nurseId,
      billingType,
      price,
      source,
    } = req.body

    if (!residentId) {
      res.status(400).json({ success: false, message: 'Resident ID is required' })
      return
    }

    if (!taskId) {
      res.status(400).json({ success: false, message: 'Care Task ID is required' })
      return
    }

    // 1. Verify resident exists
    const resident = await Resident.findByPk(residentId)
    if (!resident || resident.isDeleted) {
      res.status(404).json({ success: false, message: 'Resident not found' })
      return
    }

    // 2. Verify care task exists
    const task = await CareTask.findByPk(taskId)
    if (!task || task.isDeleted) {
      res.status(404).json({ success: false, message: 'Care task not found' })
      return
    }

    // 3. Resolve schedule time slots
    const scheduledTimes: string[] = []
    if (Array.isArray(times) && times.length > 0) {
      for (const t of times) {
        if (typeof t === 'string' && t.trim()) {
          scheduledTimes.push(formatTime12h(t.trim()))
        }
      }
    } else if (typeof time === 'string' && time.trim()) {
      scheduledTimes.push(formatTime12h(time.trim()))
    } else {
      scheduledTimes.push('10:00 AM')
    }

    // 4. Resolve frequency
    let resolvedFreq = scheduledTimes.length
    if (frequency !== undefined && frequency !== null && frequency !== '') {
      const numFreq = Number(frequency)
      if (!isNaN(numFreq) && numFreq > 0) {
        resolvedFreq = Math.floor(numFreq)
      }
    }

    // 5. Resolve billing category & price
    const effectiveBillingType = billingType || task.billingType || 'MONTHLY'
    const normalizedBillingType = String(effectiveBillingType).toUpperCase().startsWith('SESS') ? 'SESSION' : 'MONTHLY'

    let finalPrice = Number(price)
    if (isNaN(finalPrice) || finalPrice < 0) {
      finalPrice = Number(task.price) || 0
    }

    // 6. Check active package subscription for resident to auto-link
    let packageSubscriptionId: string | null = null
    let carePackageId: string | null = null
    let normalizedSource: 'PACKAGE' | 'ADDON' = 'ADDON'

    const activeSubscription = await PackageSubscription.findOne({
      where: {
        residentId,
        status: SubscriptionStatus.ACTIVE,
        isDeleted: false,
      },
    })

    if (activeSubscription) {
      if (source && String(source).toUpperCase() === 'PACKAGE') {
        normalizedSource = 'PACKAGE'
        packageSubscriptionId = activeSubscription.id
        carePackageId = activeSubscription.carePackageId || resident.carePackageId || null
      } else if (!source) {
        // Auto-check if task is covered in package subscription features
        const featureMatch = await PackageSubscriptionFeature.findOne({
          where: {
            packageSubscriptionId: activeSubscription.id,
            featureId: taskId,
            isDeleted: false,
          },
        })
        if (featureMatch) {
          normalizedSource = 'PACKAGE'
          packageSubscriptionId = activeSubscription.id
          carePackageId = activeSubscription.carePackageId || resident.carePackageId || null
        }
      }
    }

    const propertyId = resident.locId || null
    const fallbackToday = new Date().toISOString().split('T')[0] as string
    const startDateFormatted = (startDate ? String(startDate).split('T')[0] : fallbackToday) || fallbackToday
    const endDateFormatted = endDate ? String(endDate).split('T')[0] : null

    const createdAssignments = []

    for (const slotTime of scheduledTimes) {
      const assignment = await CareTaskAssignment.create({
        residentId,
        taskId,
        propertyId,
        packageSubscriptionId,
        carePackageId,
        source: normalizedSource,
        billingType: normalizedBillingType,
        price: finalPrice,
        frequency: resolvedFreq,
        startDate: startDateFormatted,
        endDate: endDateFormatted,
        time: slotTime,
        status: 'ACTIVE',
        customInstructions: customInstructions ? String(customInstructions).trim() : null,
        nurseId: nurseId || null,
        isStopped: false,
        completionCount: 0,
        isActive: true,
        isDeleted: false,
        createdBy: operatingUserId,
        updatedBy: operatingUserId,
      })

      createdAssignments.push(assignment)
    }

    res.status(201).json({
      success: true,
      message: `Successfully assigned care task "${task.careTaskName}" with ${createdAssignments.length} scheduled time slot(s).`,
      data: createdAssignments,
    })
  } catch (error) {
    console.error('Error assigning doctor care task:', error)
    const message = error instanceof Error ? error.message : 'Failed to assign care task'
    res.status(500).json({ success: false, message })
  }
}

/**
 * DELETE /api/v1/mobile/l3/medical/care-tasks/:id
 * DELETE /api/v1/mobile/l3/medical/care-task/assignments/:id
 * Delete a care task assignment for a resident.
 */
export async function deleteDoctorCareTask(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const authReq = req as AuthenticatedRequest
    const operatingUserId = authReq.user?.id || null

    if (!id) {
      res.status(400).json({ success: false, message: 'Care task assignment ID is required' })
      return
    }

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
  } catch (error) {
    console.error('Error deleting care task assignment:', error)
    const message = error instanceof Error ? error.message : 'Failed to delete care task assignment'
    res.status(500).json({ success: false, message })
  }
}
