import type { Request, Response } from 'express'
import { Op } from 'sequelize'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { CareTask, Property, Package } from '../../models/index.js'
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
    const { propertyId, priceOption, search, isActive } = req.query

    const pageNum = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1)
    const limitNum = Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50)
    const offset = (pageNum - 1) * limitNum

    const andConditions: Record<string, unknown>[] = [{ isDeleted: false }]

    // Price Option filter (Daily, Monthly, Session Wise)
    if (priceOption && typeof priceOption === 'string' && priceOption !== 'ALL') {
      if (priceOption === 'Daily') {
        andConditions.push({ dailyRate: { [Op.gt]: 0 } })
      } else if (priceOption === 'Monthly') {
        andConditions.push({ monthlyRate: { [Op.gt]: 0 } })
      } else if (priceOption === 'Session Wise') {
        andConditions.push({ sessionRate: { [Op.gt]: 0 } })
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

    const [totalCareTasks, dailyTasks, monthlyTasks, sessionWiseTasks] = await Promise.all([
      CareTask.count({ where: baseMatrixWhere }),
      CareTask.count({
        where: {
          [Op.and]: [...matrixConditions, { dailyRate: { [Op.gt]: 0 } }],
        },
      }),
      CareTask.count({
        where: {
          [Op.and]: [...matrixConditions, { monthlyRate: { [Op.gt]: 0 } }],
        },
      }),
      CareTask.count({
        where: {
          [Op.and]: [...matrixConditions, { sessionRate: { [Op.gt]: 0 } }],
        },
      }),
    ])

    res.status(200).json({
      success: true,
      data: careTasks,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages,
      },
      matrix: {
        totalCareTasks,
        dailyTasks,
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

    res.status(200).json({
      success: true,
      data: careTask,
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

    // Validate propertyId exists if provided
    if (input.propertyId) {
      const propExists = await Property.findByPk(input.propertyId)
      if (!propExists) {
        res.status(400).json({ success: false, message: 'Specified property does not exist' })
        return
      }
    }

    // Check if task name already exists within same scope
    const existingTask = await CareTask.findOne({
      where: {
        careTaskName: cleanCareTaskName,
        propertyId: input.propertyId || null,
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

    let dailyRate = parseRate(input.dailyRate)
    let monthlyRate = parseRate(input.monthlyRate)
    const rawSession =
      input.sessionRate !== undefined ? input.sessionRate : (rawInput.sessionWiseRate as number | string | undefined)
    let sessionRate = parseRate(rawSession)

    // Fallback for legacy single price input if provided
    if (dailyRate === 0 && monthlyRate === 0 && sessionRate === 0) {
      const legacyPrice = parseRate(input.careTaskPrice !== undefined ? input.careTaskPrice : rawInput.price)
      if (legacyPrice > 0) {
        if (input.priceOption === 'Monthly') monthlyRate = legacyPrice
        else if (input.priceOption === 'Session Wise') sessionRate = legacyPrice
        else dailyRate = legacyPrice
      }
    }

    const newCareTask = await CareTask.create({
      careTaskName: cleanCareTaskName,
      careTaskDescription: input.careTaskDescription || (rawInput.taskDescription as string | undefined) || null,

      dailyRate,
      monthlyRate,
      sessionRate,
      careTaskImage: finalImage,
      propertyId: input.propertyId || null,
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

    let updatedDailyRate = careTask.dailyRate
    if (input.dailyRate !== undefined) {
      updatedDailyRate = parseRate(input.dailyRate)
    }

    let updatedMonthlyRate = careTask.monthlyRate
    if (input.monthlyRate !== undefined) {
      updatedMonthlyRate = parseRate(input.monthlyRate)
    }

    let updatedSessionRate = careTask.sessionRate
    const rawSession =
      input.sessionRate !== undefined ? input.sessionRate : (rawInput.sessionWiseRate as number | string | undefined)
    if (rawSession !== undefined) {
      updatedSessionRate = parseRate(rawSession)
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

      dailyRate: updatedDailyRate,
      monthlyRate: updatedMonthlyRate,
      sessionRate: updatedSessionRate,
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
    const { page, limit, search, duration, propertyId, isActive } = req.query

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

    res.status(200).json({
      success: true,
      data: packages,
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
      ],
    })

    if (!pkg) {
      res.status(404).json({ success: false, message: 'Package not found' })
      return
    }

    res.status(200).json({ success: true, data: pkg })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch package'
    res.status(500).json({ success: false, message })
  }
}

interface RawPackageTaskItem {
  taskId: string
  careTaskName?: string
  taskName?: string
  dailyRate?: number | string
  monthlyRate?: number | string
  sessionRate?: number | string
  priceOption?: string
  careTaskPrice?: number | string | null
  price?: number | string | null
  careTaskImage?: string | null
  taskImage?: string | null
  complimentaryCount?: number | string | null
}

/**
 * Helper to enrich package tasks with database task details (name, type, price, image).
 */
async function enrichPackageTasks(rawTasks: RawPackageTaskItem[]): Promise<PackageTaskItem[]> {
  if (!Array.isArray(rawTasks) || rawTasks.length === 0) return []

  const taskIds = rawTasks.map((t) => t.taskId).filter(Boolean)
  if (taskIds.length === 0) return []

  const dbTasks = await CareTask.findAll({
    where: { id: taskIds, isDeleted: false },
    attributes: ['id', 'careTaskName', 'dailyRate', 'monthlyRate', 'sessionRate', 'careTaskImage'],
  })
  const taskMap = new Map(dbTasks.map((t) => [t.id, t]))

  return rawTasks.map((item): PackageTaskItem => {
    const dbTask = taskMap.get(item.taskId)
    const taskName = dbTask?.careTaskName || item.careTaskName || item.taskName || 'Unknown Care Task'
    const dailyRate = dbTask?.dailyRate ?? (Number(item.dailyRate) || 0)
    const monthlyRate = dbTask?.monthlyRate ?? (Number(item.monthlyRate) || 0)
    const sessionRate = dbTask?.sessionRate ?? (Number(item.sessionRate) || 0)
    const priceOption = 'Monthly'
    const careTaskPrice =
      monthlyRate > 0
        ? monthlyRate
        : item.careTaskPrice !== undefined && item.careTaskPrice !== null
          ? Number(item.careTaskPrice)
          : Number(item.price) || 0
    const careTaskImage = dbTask?.careTaskImage || item.careTaskImage || item.taskImage || null

    return {
      taskId: item.taskId,
      taskName,
      careTaskName: taskName,
      dailyRate,
      monthlyRate,
      sessionRate,
      priceOption,
      price: careTaskPrice,
      careTaskPrice,
      taskImage: careTaskImage,
      careTaskImage,
      complimentaryCount: Math.max(1, Number(item.complimentaryCount) || 1),
    }
  })
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
    const propertyId = body.propertyId || null
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

    const enrichedTasks = await enrichPackageTasks(body.tasks || [])

    const newPackage = await Package.create({
      packageName,
      packageCost,
      duration,
      tasks: enrichedTasks,
      description,
      propertyId,
      isActive,
      createdBy: operatingUserId,
      updatedBy: operatingUserId,
    })

    const createdPackage = await Package.findByPk(newPackage.id, {
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
      message: 'Package created successfully',
      data: createdPackage,
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

    if (body.tasks !== undefined) {
      updates.tasks = await enrichPackageTasks(body.tasks)
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
      ],
    })

    res.status(200).json({
      success: true,
      message: 'Package updated successfully',
      data: updatedPackage,
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

    await pkg.update({
      isDeleted: true,
      isActive: false,
      updatedBy: operatingUserId,
    })

    res.status(200).json({
      success: true,
      message: 'Package deleted successfully',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete package'
    res.status(500).json({ success: false, message })
  }
}
