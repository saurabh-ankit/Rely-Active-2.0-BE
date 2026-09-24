import type { Response } from 'express'
import { Op, type WhereOptions } from 'sequelize'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { HttpError } from '../../middlewares/error/http-error.js'
import { uploadBase64ToS3, uploadFileToS3 } from '../../middlewares/s3/index.js'
import { VitalSetting } from '../../models/index.js'
import type { CreateVitalSettingInput, UpdateVitalSettingInput } from '../../validations/vitalSetting.validation.js'

function sendError(res: Response, err: unknown, logLabel: string): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      success: false,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    })
    return
  }
  console.error(logLabel, err)
  res.status(500).json({
    success: false,
    message: err instanceof Error ? err.message : 'Unknown error',
  })
}

function toOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function numOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function formatVitalSetting(setting: VitalSetting): Record<string, unknown> {
  return {
    id: setting.id,
    name: setting.name,
    code: setting.code,
    description: setting.description,
    imageUrl: setting.imageUrl,
    unit: setting.unit,
    inputType: setting.inputType,
    lowRiskyBelow: numOrNull(setting.lowRiskyBelow),
    lowBelow: numOrNull(setting.lowBelow),
    normalMin: numOrNull(setting.normalMin),
    normalMax: numOrNull(setting.normalMax),
    highAbove: numOrNull(setting.highAbove),
    highRiskyAbove: numOrNull(setting.highRiskyAbove),
    isActive: setting.isActive,
    isDeleted: setting.isDeleted,
    createdAt: setting.createdAt,
    updatedAt: setting.updatedAt,
  }
}

function pickThresholdFields(input: CreateVitalSettingInput | UpdateVitalSettingInput) {
  return {
    lowRiskyBelow: toOptionalNumber(input.lowRiskyBelow),
    lowBelow: toOptionalNumber(input.lowBelow),
    normalMin: toOptionalNumber(input.normalMin),
    normalMax: toOptionalNumber(input.normalMax),
    highAbove: toOptionalNumber(input.highAbove),
    highRiskyAbove: toOptionalNumber(input.highRiskyAbove),
  }
}

async function resolveVitalImage(
  req: AuthenticatedRequest,
  providedImage?: string | null,
  existingImage?: string | null,
): Promise<string | null> {
  const reqWithFiles = req as AuthenticatedRequest & {
    file?: Express.Multer.File
    files?: Record<string, Express.Multer.File[]> | Express.Multer.File[]
  }
  const file =
    reqWithFiles.file ||
    (Array.isArray(reqWithFiles.files)
      ? reqWithFiles.files[0]
      : reqWithFiles.files?.vitalImage?.[0] || reqWithFiles.files?.image?.[0] || reqWithFiles.files?.file?.[0])

  if (file) {
    const s3Res = await uploadFileToS3(file, 'vital-settings')
    return s3Res.location
  }

  if (providedImage !== undefined && providedImage !== null) {
    if (!providedImage || providedImage === 'null') return null
    if (providedImage.startsWith('data:image/')) {
      return uploadBase64ToS3(providedImage, 'vital-settings')
    }
    return providedImage
  }

  return existingImage ?? null
}

async function assertNameIsFree(name: string, excludeId?: string): Promise<void> {
  const existing = await VitalSetting.findOne({
    where: {
      name,
      isDeleted: false,
      ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
    },
  })
  if (existing) {
    throw new HttpError(400, 'Vital setting with this name already exists')
  }
}

/**
 * GET /api/v1/vital-settings
 * Query: search, page, limit, isActive
 */
export async function getAllVitalSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { search, isActive } = req.query
    const pageIndex = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1)
    const pageSize = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '50'), 10) || 50))
    const offset = (pageIndex - 1) * pageSize

    const where: WhereOptions = { isDeleted: false }

    if (isActive !== undefined && isActive !== '') {
      where.isActive = isActive === 'true' || isActive === '1'
    }

    if (search && String(search).trim()) {
      const term = String(search).trim()
      Object.assign(where, {
        [Op.or]: [
          { name: { [Op.like]: `%${term}%` } },
          { description: { [Op.like]: `%${term}%` } },
          { unit: { [Op.like]: `%${term}%` } },
        ],
      })
    }

    const { count, rows } = await VitalSetting.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset,
    })

    const totalPages = Math.ceil(count / pageSize) || 1
    res.status(200).json({
      success: true,
      message: 'Vital settings fetched successfully',
      data: {
        data: rows.map(formatVitalSetting),
        pagination: {
          currentPage: pageIndex,
          totalPages,
          totalItems: count,
          itemsPerPage: pageSize,
          hasNextPage: pageIndex < totalPages,
          hasPrevPage: pageIndex > 1,
        },
      },
    })
  } catch (err) {
    sendError(res, err, 'getAllVitalSettings')
  }
}

/**
 * GET /api/v1/vital-settings/:id
 */
export async function getVitalSettingById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = String(req.params.id)
    const vitalSetting = await VitalSetting.findOne({
      where: { id, isDeleted: false },
    })
    if (!vitalSetting) {
      throw new HttpError(404, 'Vital setting not found')
    }
    res.status(200).json({
      success: true,
      message: 'Vital setting fetched successfully',
      data: formatVitalSetting(vitalSetting),
    })
  } catch (err) {
    sendError(res, err, 'getVitalSettingById')
  }
}

/**
 * POST /api/v1/vital-settings
 */
export async function createVitalSetting(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const input = req.body as CreateVitalSettingInput
    const createdBy = req.user?.id ?? null

    const imageUrl = await resolveVitalImage(req, input.imageUrl)
    if (!imageUrl?.trim()) {
      throw new HttpError(400, 'Image URL is required')
    }

    await assertNameIsFree(input.name.trim())

    const resolvedInputType = input.inputType === 'composite' ? 'composite' : 'single'
    const thresholds = pickThresholdFields(input)

    const setting = await VitalSetting.create({
      name: input.name.trim(),
      code: input.code?.trim() || null,
      description: input.description || null,
      imageUrl: imageUrl.trim(),
      unit: input.unit.trim(),
      inputType: resolvedInputType,
      ...thresholds,
      isActive: input.isActive ?? true,
      isDeleted: false,
      createdBy,
      updatedBy: createdBy,
    })

    res.status(201).json({
      success: true,
      message: 'Vital setting created successfully',
      data: formatVitalSetting(setting),
    })
  } catch (err) {
    sendError(res, err, 'createVitalSetting')
  }
}

/**
 * PUT /api/v1/vital-settings/:id
 */
export async function updateVitalSetting(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = String(req.params.id)
    const input = req.body as UpdateVitalSettingInput
    const updatedBy = req.user?.id ?? null

    const vitalSetting = await VitalSetting.findOne({ where: { id, isDeleted: false } })
    if (!vitalSetting) {
      throw new HttpError(404, 'Vital setting not found')
    }

    if (input.name && input.name.trim() !== vitalSetting.name) {
      await assertNameIsFree(input.name.trim(), id)
    }

    const imageUrl = await resolveVitalImage(req, input.imageUrl, vitalSetting.imageUrl)
    const resolvedInputType = input.inputType
      ? input.inputType === 'composite'
        ? 'composite'
        : 'single'
      : vitalSetting.inputType

    const hasThresholdUpdate =
      input.lowRiskyBelow !== undefined ||
      input.lowBelow !== undefined ||
      input.normalMin !== undefined ||
      input.normalMax !== undefined ||
      input.highAbove !== undefined ||
      input.highRiskyAbove !== undefined

    await vitalSetting.update({
      name: input.name ? input.name.trim() : vitalSetting.name,
      code: input.code !== undefined ? input.code?.trim() || null : vitalSetting.code,
      description: input.description !== undefined ? input.description : vitalSetting.description,
      imageUrl: imageUrl?.trim() || vitalSetting.imageUrl,
      unit: input.unit ? input.unit.trim() : vitalSetting.unit,
      inputType: resolvedInputType,
      ...(hasThresholdUpdate ? pickThresholdFields(input) : {}),
      isActive: input.isActive !== undefined ? input.isActive : vitalSetting.isActive,
      updatedBy,
    })

    await vitalSetting.reload()
    res.status(200).json({
      success: true,
      message: 'Vital setting updated successfully',
      data: formatVitalSetting(vitalSetting),
    })
  } catch (err) {
    sendError(res, err, 'updateVitalSetting')
  }
}

/**
 * DELETE /api/v1/vital-settings/:id (soft)
 */
export async function deleteVitalSetting(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = String(req.params.id)
    const deletedBy = req.user?.id ?? null

    const vitalSetting = await VitalSetting.findOne({ where: { id, isDeleted: false } })
    if (!vitalSetting) {
      throw new HttpError(404, 'Vital setting not found')
    }

    await vitalSetting.update({ isDeleted: true, isActive: false, updatedBy: deletedBy })

    res.status(200).json({
      success: true,
      message: 'Vital setting deleted successfully',
    })
  } catch (err) {
    sendError(res, err, 'deleteVitalSetting')
  }
}
