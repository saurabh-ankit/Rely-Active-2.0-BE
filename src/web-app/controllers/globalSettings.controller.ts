import type { Request, Response } from 'express'
import { Op } from 'sequelize'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import sequelize from '../../config/db/index.js'
import {
  CareTask,
  Property,
  Package,
  CarePackageFeaturesMap,
  PackageSubscription,
  PackageSubscriptionFeature,
  Resident,
  CareTaskAssignment,
} from '../../models/index.js'
import { SubscriptionStatus } from '../../enums/packageSubscription.enum.js'
import { syncPackageTasksForResidents } from './careTaskAssignment.controller.js'
import type { PackageTaskItem, PackageAttributes } from '../../models/package.model.js'
import { uploadFileToS3, uploadBase64ToS3 } from '../../middlewares/s3/index.js'
import type {
  CreateCareTaskInput,
  UpdateCareTaskInput,
  CreatePackageInput,
  UpdatePackageInput,
} from '../../validations/globalSettings.validation.js'

/**
 * Upload task image from multipart file or base64 data URL
 */
async function resolveTaskImage(
  req: Request,
  providedImage?: string | null,
  existingImage?: string | null,
): Promise<string | null> {
  const reqWithFiles = req as Request & {
    file?: Express.Multer.File
    files?: Record<string, Express.Multer.File[]> | Express.Multer.File[]
  }
  const file =
    reqWithFiles.file ||
    (Array.isArray(reqWithFiles.files)
      ? reqWithFiles.files[0]
      : reqWithFiles.files?.careTaskImage?.[0] || reqWithFiles.files?.taskImage?.[0] || reqWithFiles.files?.image?.[0])

  if (file) {
    const s3Res = await uploadFileToS3(file, 'care-tasks')
    return s3Res.location
  }

  if (providedImage !== undefined) {
    if (!providedImage || providedImage === 'null') return null
    if (providedImage.startsWith('data:image/')) {
      return uploadBase64ToS3(providedImage, 'tasks')
    }
    return providedImage
  }

  return existingImage ?? null
}

/**
 * Format taskType to standard display string ('Care Task' or 'ADL')
 */
/**
 * Get all care tasks with optional filters (priceOption, search, propertyId).
 */
export async function getAllCareTasks(req: Request, res: Response): Promise<void> {
  try {
    const { priceOption, billingType: billingTypeQuery, search, isActive } = req.query
    const propertyId = (req.params.locationId as string) || (req.query.propertyId as string)

    const pageNum = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1)
    const limitNum = Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50)
    const offset = (pageNum - 1) * limitNum

    const andConditions: Record<string, unknown>[] = [{ isDeleted: false }]

    // Billing Type filter (MONTHLY or SESSION)
    const typeFilter = String(billingTypeQuery || priceOption || '').toUpperCase()
    if (typeFilter && typeFilter !== 'ALL') {
      if (typeFilter.startsWith('MONTH')) {
        andConditions.push({ billingType: 'MONTHLY' })
      } else if (typeFilter.startsWith('SESS')) {
        andConditions.push({ billingType: 'SESSION' })
      }
    }

    // Active status filter
    if (isActive !== undefined && isActive !== '') {
      andConditions.push({ isActive: isActive === 'true' || isActive === '1' })
    }

    // Property ID filter
    if (propertyId && typeof propertyId === 'string') {
      if (propertyId === 'global' || propertyId === 'null') {
        andConditions.push({ propertyId: null })
      } else if (propertyId !== 'all') {
        if (req.query.includeGlobal === 'false') {
          andConditions.push({ propertyId })
        } else {
          // Default: include both property-specific tasks and global templates
          andConditions.push({
            [Op.or]: [{ propertyId }, { propertyId: null }],
          })
        }
      }
    }

    // Search query filter (matches careTaskName or careTaskDescription)
    if (search && typeof search === 'string' && search.trim() !== '') {
      const searchPattern = `%${search.trim()}%`
      andConditions.push({
        [Op.or]: [
          { careTaskName: { [Op.like]: searchPattern } },
          { careTaskDescription: { [Op.like]: searchPattern } },
        ],
      })
    }

    const where = { [Op.and]: andConditions }

    const { count, rows: careTasks } = await CareTask.findAndCountAll({
      where,
      include: [
        {
          model: Property,
          as: 'property',
          attributes: ['id', 'property_name', 'city', 'state'],
          required: false,
        },
      ],
      order: [
        ['createdAt', 'DESC'],
        ['careTaskName', 'ASC'],
      ],
      limit: limitNum,
      offset,
      distinct: true,
    })

    const totalPages = Math.ceil(count / limitNum)

    // Check which tasks have active assignments in CareTaskAssignment
    const taskIds = careTasks.map((t) => t.id)
    const assignedTasks =
      taskIds.length > 0
        ? await CareTaskAssignment.findAll({
            where: {
              taskId: { [Op.in]: taskIds },
              isDeleted: false,
            },
            attributes: ['taskId'],
            raw: true,
          })
        : []

    const assignedTaskSet = new Set(assignedTasks.map((a) => a.taskId))

    const enrichedCareTasks = careTasks.map((t) => {
      const json = typeof t.toJSON === 'function' ? t.toJSON() : t
      return {
        ...json,
        isAssigned: assignedTaskSet.has(t.id),
      }
    })

    // Calculate matrix summary counts for the active property scope
    const matrixConditions: Record<string, unknown>[] = [{ isDeleted: false }]
    if (propertyId && typeof propertyId === 'string') {
      if (propertyId === 'global' || propertyId === 'null') {
        matrixConditions.push({ propertyId: null })
      } else if (propertyId !== 'all') {
        if (req.query.includeGlobal === 'false') {
          matrixConditions.push({ propertyId })
        } else {
          matrixConditions.push({
            [Op.or]: [{ propertyId }, { propertyId: null }],
          })
        }
      }
    }

    const baseMatrixWhere = { [Op.and]: matrixConditions }

    const [totalCareTasks, monthlyTasks, sessionWiseTasks] = await Promise.all([
      CareTask.count({ where: baseMatrixWhere }),
      CareTask.count({
        where: {
          [Op.and]: [...matrixConditions, { billingType: 'MONTHLY' }],
        },
      }),
      CareTask.count({
        where: {
          [Op.and]: [...matrixConditions, { billingType: 'SESSION' }],
        },
      }),
    ])

    res.status(200).json({
      success: true,
      data: enrichedCareTasks,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages,
      },
      matrix: {
        totalCareTasks,
        dailyTasks: 0,
        monthlyTasks,
        sessionWiseTasks,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch care tasks'
    res.status(500).json({ success: false, message })
  }
}

/**
 * Get a single care task by ID.
 */
export async function getCareTaskById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const careTask = await CareTask.findOne({
      where: { id, isDeleted: false },
      include: [
        {
          model: Property,
          as: 'property',
          attributes: ['id', 'property_name', 'city', 'state'],
          required: false,
        },
      ],
    })

    if (!careTask) {
      res.status(404).json({ success: false, message: 'Care task not found' })
      return
    }

    const hasAssignment = await CareTaskAssignment.findOne({
      where: { taskId: id, isDeleted: false },
      attributes: ['id'],
      raw: true,
    })

    const json = typeof careTask.toJSON === 'function' ? careTask.toJSON() : careTask
    res.status(200).json({
      success: true,
      data: {
        ...json,
        isAssigned: Boolean(hasAssignment),
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch care task'
    res.status(500).json({ success: false, message })
  }
}

/**
 * Create a new CareTask.
 */
export async function createCareTask(req: Request, res: Response): Promise<void> {
  try {
    const input = req.body as CreateCareTaskInput & { taskName?: string; price?: number | string }
    const operatingUserId = (req as AuthenticatedRequest).user?.id || null

    const rawName = input.careTaskName || input.taskName || ''
    const cleanCareTaskName = rawName.trim()
    if (!cleanCareTaskName) {
      res.status(400).json({ success: false, message: 'Care Task Name is required' })
      return
    }

    const targetPropertyId = input.propertyId || (req.params.locationId as string) || null

    // Validate propertyId exists if provided
    if (targetPropertyId) {
      const propExists = await Property.findByPk(targetPropertyId)
      if (!propExists) {
        res.status(400).json({ success: false, message: 'Specified property does not exist' })
        return
      }
    }

    // Check if task name already exists within same scope
    const existingTask = await CareTask.findOne({
      where: {
        careTaskName: cleanCareTaskName,
        propertyId: targetPropertyId,
        isDeleted: false,
      },
    })

    if (existingTask) {
      res.status(400).json({ success: false, message: 'Care task with this name already exists' })
      return
    }

    const rawInput = input as Record<string, unknown>
    const finalImage = await resolveTaskImage(req, input.careTaskImage || (rawInput.taskImage as string | undefined))

    const parseRate = (val: unknown) => {
      if (val === undefined || val === null || val === '') return 0
      const n = Number(val)
      return isNaN(n) || n < 0 ? 0 : n
    }

    const rawBillingType = String(
      (input as { billingType?: string }).billingType ||
        (rawInput.billingType as string) ||
        (rawInput.priceOption as string) ||
        '',
    )
      .trim()
      .toUpperCase()

    const billingType: 'MONTHLY' | 'SESSION' = rawBillingType.startsWith('SESS') ? 'SESSION' : 'MONTHLY'
    const finalPrice = parseRate(
      (input as { price?: number | string }).price ?? (rawInput.price as number | string | undefined),
    )

    const newCareTask = await CareTask.create({
      careTaskName: cleanCareTaskName,
      careTaskDescription: input.careTaskDescription || (rawInput.taskDescription as string | undefined) || null,
      billingType,
      price: finalPrice,
      careTaskImage: finalImage,
      propertyId: targetPropertyId,
      isActive: input.isActive ?? true,
      isDeleted: false,
      createdBy: operatingUserId,
      updatedBy: operatingUserId,
    })

    const taskWithProperty = await CareTask.findByPk(newCareTask.id, {
      include: [
        {
          model: Property,
          as: 'property',
          attributes: ['id', 'property_name', 'city', 'state'],
          required: false,
        },
      ],
    })

    res.status(201).json({
      success: true,
      message: 'Care task created successfully',
      data: taskWithProperty,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create care task'
    const statusCode = message.includes('already exists') ? 400 : 500
    res.status(statusCode).json({ success: false, message })
  }
}

/**
 * Update an existing CareTask.
 */
export async function updateCareTask(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const input = req.body as UpdateCareTaskInput & { taskName?: string; price?: number | string }
    const operatingUserId = (req as AuthenticatedRequest).user?.id || null

    const careTask = await CareTask.findOne({
      where: { id, isDeleted: false },
    })

    if (!careTask) {
      res.status(404).json({ success: false, message: 'Care task not found' })
      return
    }

    // Check if care task is already included in any resident care task assignments
    const existingAssignment = await CareTaskAssignment.findOne({
      where: { taskId: careTask.id, isDeleted: false },
    })
    if (existingAssignment) {
      res.status(400).json({
        success: false,
        message: 'Cannot edit this care task because it is already assigned to residents.',
      })
      return
    }

    if (input.propertyId !== undefined && input.propertyId !== null) {
      const propExists = await Property.findByPk(input.propertyId)
      if (!propExists) {
        res.status(400).json({ success: false, message: 'Specified property does not exist' })
        return
      }
    }

    const rawName = input.careTaskName || input.taskName
    if (rawName !== undefined && rawName.trim() !== '') {
      const cleanCareTaskName = rawName.trim()
      const existingTask = await CareTask.findOne({
        where: {
          careTaskName: cleanCareTaskName,
          propertyId: input.propertyId !== undefined ? input.propertyId : careTask.propertyId,
          id: { [Op.ne]: careTask.id },
          isDeleted: false,
        },
      })

      if (existingTask) {
        res.status(400).json({ success: false, message: 'Care task with this name already exists' })
        return
      }
    }

    const rawInput = input as Record<string, unknown>
    const parseRate = (val: unknown) => {
      if (val === undefined || val === null || val === '') return 0
      const n = Number(val)
      return isNaN(n) || n < 0 ? 0 : n
    }

    const rawBillingType = (input as { billingType?: string }).billingType
    let updatedBillingType = careTask.billingType
    if (rawBillingType !== undefined && rawBillingType.trim() !== '') {
      const u = rawBillingType.trim().toUpperCase()
      if (u.startsWith('SESS')) updatedBillingType = 'SESSION'
      else if (u.startsWith('MONTH')) updatedBillingType = 'MONTHLY'
    }

    let updatedPrice = careTask.price
    if ((input as { price?: number | string }).price !== undefined) {
      updatedPrice = parseRate((input as { price?: number | string }).price)
    }

    const finalImage = await resolveTaskImage(
      req,
      input.careTaskImage || (rawInput.taskImage as string | undefined),
      careTask.careTaskImage,
    )

    const extraDesc = rawInput.taskDescription as string | null | undefined
    await careTask.update({
      careTaskName: rawName !== undefined ? rawName.trim() : careTask.careTaskName,
      careTaskDescription:
        input.careTaskDescription !== undefined
          ? input.careTaskDescription
          : extraDesc !== undefined
            ? extraDesc
            : careTask.careTaskDescription,
      billingType: updatedBillingType,
      price: updatedPrice,
      careTaskImage: finalImage,
      propertyId: input.propertyId !== undefined ? input.propertyId : careTask.propertyId,
      isActive: input.isActive !== undefined ? input.isActive : careTask.isActive,
      updatedBy: operatingUserId,
    })

    const updatedTask = await CareTask.findByPk(careTask.id, {
      include: [
        {
          model: Property,
          as: 'property',
          attributes: ['id', 'property_name', 'city', 'state'],
          required: false,
        },
      ],
    })

    res.status(200).json({
      success: true,
      message: 'Care task updated successfully',
      data: updatedTask,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update care task'
    res.status(500).json({ success: false, message })
  }
}

/**
 * Soft delete a CareTask.
 */
export async function deleteCareTask(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const operatingUserId = (req as AuthenticatedRequest).user?.id || null

    const careTask = await CareTask.findOne({
      where: { id, isDeleted: false },
    })

    if (!careTask) {
      res.status(404).json({ success: false, message: 'Care task not found' })
      return
    }

    // Check if care task is already included in any resident care task assignments
    const existingAssignment = await CareTaskAssignment.findOne({
      where: { taskId: careTask.id, isDeleted: false },
    })
    if (existingAssignment) {
      res.status(400).json({
        success: false,
        message: 'Cannot delete this care task because it is already assigned to residents.',
      })
      return
    }

    await careTask.update({
      isDeleted: true,
      isActive: false,
      updatedBy: operatingUserId,
    })

    res.status(200).json({
      success: true,
      message: 'Care task deleted successfully',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete care task'
    res.status(500).json({ success: false, message })
  }
}

// Backwards-compatible aliases
export const getAllTasks = getAllCareTasks
export const getTaskById = getCareTaskById
export const createTask = createCareTask
export const updateTask = updateCareTask
export const deleteTask = deleteCareTask

// ═══════════════════════════════════════════════════════════════════════════════
// ── PACKAGES CONTROLLERS ───────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all packages with filtering, search, pagination, and matrix summary counts.
 */
export async function getAllPackages(req: Request, res: Response): Promise<void> {
  try {
    const { page, limit, search, duration, isActive } = req.query
    const propertyId = (req.params.locationId as string) || (req.query.propertyId as string)

    const pageNum = Math.max(1, parseInt(String(page || '1'), 10) || 1)
    const limitNum = Math.max(1, parseInt(String(limit || '50'), 10) || 50)
    const offset = (pageNum - 1) * limitNum

    const andConditions: Record<string, unknown>[] = [{ isDeleted: false }]

    // Duration filter ('Monthly' | 'Yearly')
    if (duration && typeof duration === 'string' && duration !== 'ALL') {
      andConditions.push({ duration })
    }

    // Active status filter
    if (isActive !== undefined && isActive !== '') {
      andConditions.push({ isActive: isActive === 'true' || isActive === '1' })
    }

    // Property ID filter
    if (propertyId && typeof propertyId === 'string') {
      if (propertyId === 'global' || propertyId === 'null') {
        andConditions.push({ propertyId: null })
      } else if (propertyId !== 'all') {
        if (req.query.includeGlobal === 'false') {
          andConditions.push({ propertyId })
        } else {
          // Default: include both property-specific packages and global templates
          andConditions.push({
            [Op.or]: [{ propertyId }, { propertyId: null }],
          })
        }
      }
    }

    // Search query filter (matches packageName or description)
    if (search && typeof search === 'string' && search.trim() !== '') {
      const searchPattern = `%${search.trim()}%`
      andConditions.push({
        [Op.or]: [{ packageName: { [Op.like]: searchPattern } }, { description: { [Op.like]: searchPattern } }],
      })
    }

    const where = { [Op.and]: andConditions }

    const { count, rows: packages } = await Package.findAndCountAll({
      where,
      include: [
        {
          model: Property,
          as: 'property',
          attributes: ['id', 'property_name', 'city', 'state'],
          required: false,
        },
        {
          model: CareTask,
          as: 'features',
          attributes: ['id', 'careTaskName', 'careTaskDescription', 'billingType', 'price', 'careTaskImage'],
          through: { attributes: ['complimentaryCount'] },
          where: { isDeleted: false },
          required: false,
        },
      ],
      order: [
        ['createdAt', 'DESC'],
        ['packageName', 'ASC'],
      ],
      limit: limitNum,
      offset,
      distinct: true,
    })

    const totalPages = Math.ceil(count / limitNum)

    // Calculate matrix summary counts for the active property scope
    const matrixConditions: Record<string, unknown>[] = [{ isDeleted: false }]
    if (propertyId && typeof propertyId === 'string') {
      if (propertyId === 'global' || propertyId === 'null') {
        matrixConditions.push({ propertyId: null })
      } else if (propertyId !== 'all') {
        if (req.query.includeGlobal === 'false') {
          matrixConditions.push({ propertyId })
        } else {
          matrixConditions.push({
            [Op.or]: [{ propertyId }, { propertyId: null }],
          })
        }
      }
    }

    const baseMatrixWhere = { [Op.and]: matrixConditions }

    const [totalPackagesCount, monthlyPackagesCount, yearlyPackagesCount] = await Promise.all([
      Package.count({ where: baseMatrixWhere }),
      Package.count({
        where: {
          [Op.and]: [...matrixConditions, { duration: 'Monthly' }],
        },
      }),
      Package.count({
        where: {
          [Op.and]: [...matrixConditions, { duration: 'Yearly' }],
        },
      }),
    ])

    const packageIds = packages.map((p) => p.id)

    // Check subscriptions and residents for each package
    const subMap = new Map<string, { total: number; active: number }>()

    if (packageIds.length > 0) {
      const [subRows, residentRows] = await Promise.all([
        PackageSubscription.findAll({
          where: {
            carePackageId: packageIds,
            isDeleted: false,
          },
          attributes: [
            'carePackageId',
            [sequelize.fn('COUNT', sequelize.col('id')), 'subCount'],
            [sequelize.fn('SUM', sequelize.literal("CASE WHEN status = 'Active' THEN 1 ELSE 0 END")), 'activeSubCount'],
          ],
          group: ['carePackageId'],
          raw: true,
        }) as unknown as Promise<
          Array<{
            carePackageId: string
            subCount: string | number
            activeSubCount: string | number
          }>
        >,
        Resident.findAll({
          where: {
            carePackageId: packageIds,
            isDeleted: false,
          },
          attributes: ['carePackageId', [sequelize.fn('COUNT', sequelize.col('id')), 'residentCount']],
          group: ['carePackageId'],
          raw: true,
        }) as unknown as Promise<
          Array<{
            carePackageId: string
            residentCount: string | number
          }>
        >,
      ])

      for (const row of subRows) {
        subMap.set(row.carePackageId, {
          total: Number(row.subCount) || 0,
          active: Number(row.activeSubCount) || 0,
        })
      }

      for (const row of residentRows) {
        const existing = subMap.get(row.carePackageId) || { total: 0, active: 0 }
        const rCount = Number(row.residentCount) || 0
        subMap.set(row.carePackageId, {
          total: Math.max(existing.total, rCount),
          active: Math.max(existing.active, rCount),
        })
      }
    }

    res.status(200).json({
      success: true,
      data: packages.map((pkg) => formatPackageWithTasks(pkg, subMap.get(pkg.id))),
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages,
      },
      matrix: {
        totalPackages: totalPackagesCount,
        monthlyPackages: monthlyPackagesCount,
        yearlyPackages: yearlyPackagesCount,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch packages'
    res.status(500).json({ success: false, message })
  }
}

/**
 * Formats a package record for responses, projecting relational features from CarePackageFeaturesMap
 * into a backward-compatible tasks array alongside the features association.
 */
export function formatPackageWithTasks(pkg: Package, subInfo?: { total: number; active: number }) {
  const plain = (pkg.toJSON ? pkg.toJSON() : { ...pkg }) as unknown as Record<string, unknown>
  const features = (Array.isArray(pkg.features) ? pkg.features : []) as Array<
    CareTask & { CarePackageFeaturesMap?: CarePackageFeaturesMap }
  >
  const tasks: PackageTaskItem[] = features.map((f) => {
    const isFree = Number(f.price) <= 0
    const complimentaryCount =
      f.CarePackageFeaturesMap?.complimentaryCount !== undefined
        ? Number(f.CarePackageFeaturesMap.complimentaryCount)
        : isFree
          ? 0
          : 1
    return {
      taskId: f.id,
      taskName: f.careTaskName || 'Care Task',
      careTaskName: f.careTaskName || 'Care Task',
      billingType: f.billingType || 'MONTHLY',
      price: Number(f.price) || 0,
      taskImage: f.careTaskImage || null,
      careTaskImage: f.careTaskImage || null,
      complimentaryCount,
    }
  })

  const subscriptionCount = subInfo?.total ?? 0
  const activeSubscriptionCount = subInfo?.active ?? 0
  const isSubscribed = subscriptionCount > 0

  return {
    ...plain,
    tasks,
    isSubscribed,
    subscriptionCount,
    activeSubscriptionCount,
  }
}

/**
 * Get a single package by ID.
 */
export async function getPackageById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params

    const pkg = await Package.findOne({
      where: { id, isDeleted: false },
      include: [
        {
          model: Property,
          as: 'property',
          attributes: ['id', 'property_name', 'city', 'state'],
          required: false,
        },
        {
          model: CareTask,
          as: 'features',
          attributes: ['id', 'careTaskName', 'careTaskDescription', 'billingType', 'price', 'careTaskImage'],
          through: { attributes: ['complimentaryCount'] },
          where: { isDeleted: false },
          required: false,
        },
      ],
    })

    if (!pkg) {
      res.status(404).json({ success: false, message: 'Package not found' })
      return
    }

    const [subCount, residentCount] = await Promise.all([
      PackageSubscription.count({ where: { carePackageId: pkg.id, isDeleted: false } }),
      Resident.count({ where: { carePackageId: pkg.id, isDeleted: false } }),
    ])
    const totalSubs = Math.max(subCount, residentCount)

    res.status(200).json({
      success: true,
      data: formatPackageWithTasks(pkg, { total: totalSubs, active: totalSubs }),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch package'
    res.status(500).json({ success: false, message })
  }
}

interface RawPackageTaskItem {
  taskId?: string
  featureId?: string
  careTaskName?: string
  taskName?: string
  billingType?: string
  price?: number | string | null
  careTaskImage?: string | null
  taskImage?: string | null
  complimentaryCount?: number | string | null
}

interface EnrichedPackageTasksResult {
  enrichedTasks: PackageTaskItem[]
  validCareTaskIds: Set<string>
}

/**
 * Helper to enrich package tasks with database task details (name, type, price, image).
 */
async function enrichPackageTasks(rawTasks: (RawPackageTaskItem | string)[]): Promise<EnrichedPackageTasksResult> {
  if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
    return { enrichedTasks: [], validCareTaskIds: new Set() }
  }

  const normalized: RawPackageTaskItem[] = rawTasks.map((item) => {
    if (typeof item === 'string') {
      return { taskId: item, featureId: item, complimentaryCount: 1 }
    }
    const id = item.taskId || item.featureId || ''
    return {
      ...item,
      taskId: id,
      featureId: id,
    }
  })

  const taskIds = normalized.map((t) => t.taskId).filter((id): id is string => Boolean(id))
  if (taskIds.length === 0) {
    return { enrichedTasks: [], validCareTaskIds: new Set() }
  }

  const dbTasks = await CareTask.findAll({
    where: { id: taskIds, isDeleted: false },
    attributes: ['id', 'careTaskName', 'billingType', 'price', 'careTaskImage'],
  })
  const taskMap = new Map(dbTasks.map((t) => [t.id, t]))
  const validCareTaskIds = new Set(dbTasks.map((t) => t.id))

  const enrichedTasks = normalized.map((item): PackageTaskItem => {
    const taskId = item.taskId || ''
    const dbTask = taskMap.get(taskId)
    const taskName = dbTask?.careTaskName || item.careTaskName || item.taskName || 'Unknown Care Task'
    const billingType = dbTask?.billingType || (item as { billingType?: string }).billingType || 'MONTHLY'
    const price = Number(dbTask?.price ?? item.price ?? 0)
    const careTaskImage = dbTask?.careTaskImage || item.careTaskImage || item.taskImage || null

    return {
      taskId,
      taskName,
      careTaskName: taskName,
      billingType,
      price,
      taskImage: careTaskImage,
      careTaskImage,
      complimentaryCount: price <= 0 ? 0 : Math.max(0, Number(item.complimentaryCount ?? 1)),
    }
  })

  return { enrichedTasks, validCareTaskIds }
}

/**
 * Create a new package.
 */
export async function createPackage(req: Request, res: Response): Promise<void> {
  try {
    const body = (req as Request & { validatedBody?: CreatePackageInput }).validatedBody || req.body
    const operatingUserId = (req as AuthenticatedRequest).user?.id || null

    const packageName = String(body.packageName || '').trim()
    const packageCost = Number(body.packageCost) || 0
    const duration = body.duration === 'Yearly' ? 'Yearly' : 'Monthly'
    const propertyId = body.propertyId || (req.params.locationId as string) || null
    const description = body.description ? String(body.description).trim() : null
    const isActive = body.isActive !== undefined ? Boolean(body.isActive) : true

    // Check duplicate name within the same property/global scope
    const existingPackage = await Package.findOne({
      where: {
        packageName,
        propertyId: propertyId || null,
        isDeleted: false,
      },
    })

    if (existingPackage) {
      res.status(409).json({
        success: false,
        message: `Package with name "${packageName}" already exists in this scope. Please choose a different name.`,
      })
      return
    }

    const rawTasks = body.tasks || (body as { features?: (RawPackageTaskItem | string)[] }).features || []
    const { enrichedTasks, validCareTaskIds } = await enrichPackageTasks(rawTasks)

    const newPackage = await Package.create({
      packageName,
      packageCost,
      duration,
      description,
      propertyId,
      isActive,
      createdBy: operatingUserId,
      updatedBy: operatingUserId,
    })

    // Write mapping rows to CarePackageFeaturesMap with complimentaryCount (mirroring Rely-Assist)
    const mapRows: Array<{
      carePackageId: string
      featureId: string
      complimentaryCount: number
      createdBy: string | null
      updatedBy: string | null
    }> = []

    const seenFeatureIds = new Set<string>()
    for (const t of enrichedTasks) {
      const fId = t.taskId
      if (fId && validCareTaskIds.has(fId) && !seenFeatureIds.has(fId)) {
        seenFeatureIds.add(fId)
        mapRows.push({
          carePackageId: newPackage.id,
          featureId: fId,
          complimentaryCount: t.complimentaryCount ?? 0,
          createdBy: operatingUserId,
          updatedBy: operatingUserId,
        })
      }
    }

    if (mapRows.length > 0) {
      await CarePackageFeaturesMap.bulkCreate(mapRows)
    }

    const createdPackage = await Package.findByPk(newPackage.id, {
      include: [
        {
          model: Property,
          as: 'property',
          attributes: ['id', 'property_name', 'city', 'state'],
          required: false,
        },
        {
          model: CareTask,
          as: 'features',
          attributes: ['id', 'careTaskName', 'careTaskDescription', 'billingType', 'price', 'careTaskImage'],
          through: { attributes: ['complimentaryCount'] },
          where: { isDeleted: false },
          required: false,
        },
      ],
    })

    res.status(201).json({
      success: true,
      message: 'Package created successfully',
      data: createdPackage ? formatPackageWithTasks(createdPackage) : null,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create package'
    res.status(500).json({ success: false, message })
  }
}

/**
 * Update an existing package.
 */
export async function updatePackage(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const body = (req as Request & { validatedBody?: UpdatePackageInput }).validatedBody || req.body
    const operatingUserId = (req as AuthenticatedRequest).user?.id || null

    const pkg = await Package.findOne({
      where: { id, isDeleted: false },
    })

    if (!pkg) {
      res.status(404).json({ success: false, message: 'Package not found' })
      return
    }

    const updates: Partial<PackageAttributes> = {
      updatedBy: operatingUserId,
    }

    if (body.packageName !== undefined) {
      const trimmedName = String(body.packageName).trim()
      const targetPropertyId = body.propertyId !== undefined ? body.propertyId : pkg.propertyId

      const existingPackage = await Package.findOne({
        where: {
          packageName: trimmedName,
          propertyId: targetPropertyId || null,
          isDeleted: false,
          id: { [Op.ne]: String(id) },
        },
      })

      if (existingPackage) {
        res.status(409).json({
          success: false,
          message: `Package with name "${trimmedName}" already exists in this scope. Please choose a different name.`,
        })
        return
      }

      updates.packageName = trimmedName
    }

    if (body.packageCost !== undefined) {
      updates.packageCost = Number(body.packageCost) || 0
    }

    if (body.duration !== undefined) {
      updates.duration = body.duration === 'Yearly' ? 'Yearly' : 'Monthly'
    }

    const incomingTasks =
      body.tasks !== undefined ? body.tasks : (body as { features?: (RawPackageTaskItem | string)[] }).features

    if (incomingTasks !== undefined) {
      const { enrichedTasks, validCareTaskIds } = await enrichPackageTasks(incomingTasks)

      // Sync CarePackageFeaturesMap (mirroring Rely-Assist)
      await CarePackageFeaturesMap.destroy({
        where: { carePackageId: pkg.id },
      })

      const mapRows: Array<{
        carePackageId: string
        featureId: string
        complimentaryCount: number
        createdBy: string | null
        updatedBy: string | null
      }> = []

      const seenFeatureIds = new Set<string>()
      for (const t of enrichedTasks) {
        const fId = t.taskId
        if (fId && validCareTaskIds.has(fId) && !seenFeatureIds.has(fId)) {
          seenFeatureIds.add(fId)
          mapRows.push({
            carePackageId: pkg.id,
            featureId: fId,
            complimentaryCount: t.complimentaryCount ?? 0,
            createdBy: operatingUserId,
            updatedBy: operatingUserId,
          })
        }
      }

      if (mapRows.length > 0) {
        await CarePackageFeaturesMap.bulkCreate(mapRows)
      }

      // When package features are updated, cancel previous package care task assignments for all active subscriptions
      const activeSubs = await PackageSubscription.findAll({
        where: { carePackageId: pkg.id, status: SubscriptionStatus.ACTIVE, isDeleted: false },
      })
      for (const sub of activeSubs) {
        // Cancel & soft delete all previous package care task assignments
        await CareTaskAssignment.update(
          {
            status: 'CANCELLED',
            isStopped: true,
            stoppedAt: new Date(),
            stoppedBy: operatingUserId,
            isActive: false,
            isDeleted: true,
            updatedBy: operatingUserId,
          },
          {
            where: {
              packageSubscriptionId: sub.id,
              source: 'PACKAGE',
              isDeleted: false,
            },
          },
        )

        // Soft delete previous subscription features
        await PackageSubscriptionFeature.update(
          { isDeleted: true, updatedBy: operatingUserId },
          { where: { packageSubscriptionId: sub.id, isDeleted: false } },
        )

        // Re-seed updated features
        if (mapRows.length > 0) {
          await PackageSubscriptionFeature.bulkCreate(
            mapRows.map((m) => ({
              packageSubscriptionId: sub.id,
              featureId: m.featureId,
              complimentaryCount: m.complimentaryCount,
              remainingCount: m.complimentaryCount,
              createdBy: operatingUserId,
              updatedBy: operatingUserId,
            })),
          )
        }

        // Re-sync new package tasks for this resident
        await syncPackageTasksForResidents(sub.residentId, sub.propertyId)
      }
    }

    if (body.description !== undefined) {
      updates.description = body.description ? String(body.description).trim() : null
    }

    if (body.propertyId !== undefined) {
      updates.propertyId = body.propertyId || null
    }

    if (body.isActive !== undefined) {
      updates.isActive = Boolean(body.isActive)
    }

    await pkg.update(updates)

    const updatedPackage = await Package.findByPk(pkg.id, {
      include: [
        {
          model: Property,
          as: 'property',
          attributes: ['id', 'property_name', 'city', 'state'],
          required: false,
        },
        {
          model: CareTask,
          as: 'features',
          attributes: ['id', 'careTaskName', 'careTaskDescription', 'billingType', 'price', 'careTaskImage'],
          through: { attributes: ['complimentaryCount'] },
          where: { isDeleted: false },
          required: false,
        },
      ],
    })

    res.status(200).json({
      success: true,
      message: 'Package updated successfully',
      data: updatedPackage ? formatPackageWithTasks(updatedPackage) : null,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update package'
    res.status(500).json({ success: false, message })
  }
}

/**
 * Soft delete a package.
 */
export async function deletePackage(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const operatingUserId = (req as AuthenticatedRequest).user?.id || null

    const pkg = await Package.findOne({
      where: { id, isDeleted: false },
    })

    if (!pkg) {
      res.status(404).json({ success: false, message: 'Package not found' })
      return
    }

    // Check if this package is already subscribed by residents
    const [subCount, residentCount] = await Promise.all([
      PackageSubscription.count({ where: { carePackageId: pkg.id, isDeleted: false } }),
      Resident.count({ where: { carePackageId: pkg.id, isDeleted: false } }),
    ])

    if (subCount > 0 || residentCount > 0) {
      res.status(400).json({
        success: false,
        message: 'Cannot delete this care package because it is already subscribed by residents.',
      })
      return
    }

    await pkg.update({
      isDeleted: true,
      isActive: false,
      updatedBy: operatingUserId,
    })

    await CarePackageFeaturesMap.update(
      { isDeleted: true, isActive: false, updatedBy: operatingUserId },
      { where: { carePackageId: pkg.id } },
    )

    res.status(200).json({
      success: true,
      message: 'Package deleted successfully',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete package'
    res.status(500).json({ success: false, message })
  }
}
