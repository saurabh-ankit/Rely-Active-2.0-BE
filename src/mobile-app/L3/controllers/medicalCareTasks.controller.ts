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
