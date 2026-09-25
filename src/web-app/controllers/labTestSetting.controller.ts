import type { Response } from 'express'
import { Op, type WhereOptions } from 'sequelize'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { HttpError } from '../../middlewares/error/http-error.js'
import { uploadBase64ToS3, uploadFileToS3 } from '../../middlewares/s3/index.js'
import { LabTestSetting } from '../../models/index.js'
import type {
  CreateLabTestSettingInput,
  UpdateLabTestSettingInput,
} from '../../validations/labTestSetting.validation.js'

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

function formatLabTestSetting(setting: LabTestSetting): Record<string, unknown> {
  return {
    id: setting.id,
    name: setting.name,
    description: setting.description,
    instructions: setting.instructions,
    imageUrl: setting.imageUrl,
    isActive: setting.isActive,
    isDeleted: setting.isDeleted,
    createdAt: setting.createdAt,
    updatedAt: setting.updatedAt,
  }
}

async function resolveLabTestImage(
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
      : reqWithFiles.files?.icon?.[0] || reqWithFiles.files?.image?.[0] || reqWithFiles.files?.file?.[0])

  if (file) {
    const s3Res = await uploadFileToS3(file, 'lab-test-settings')
    return s3Res.location
  }

  if (providedImage !== undefined && providedImage !== null) {
    if (!providedImage || providedImage === 'null') return null
    if (providedImage.startsWith('data:image/')) {
      return uploadBase64ToS3(providedImage, 'lab-test-settings')
    }
    return providedImage
  }

  return existingImage ?? null
}

async function assertNameIsFree(name: string, excludeId?: string): Promise<void> {
  const existing = await LabTestSetting.findOne({
    where: {
      name,
      isDeleted: false,
      ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
    },
  })
  if (existing) {
    throw new HttpError(400, 'Lab test setting with this name already exists')
  }
}

/**
 * GET /api/v1/lab-test-settings
 * Query: search, page, limit, isActive
 */
export async function getAllLabTestSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
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
          { instructions: { [Op.like]: `%${term}%` } },
        ],
      })
    }

    const { count, rows } = await LabTestSetting.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset,
    })

    const totalPages = Math.ceil(count / pageSize) || 1
    res.status(200).json({
      success: true,
      message: 'Lab test settings fetched successfully',
      data: {
        data: rows.map(formatLabTestSetting),
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
    sendError(res, err, 'getAllLabTestSettings')
  }
}

/**
 * GET /api/v1/lab-test-settings/:id
 */
export async function getLabTestSettingById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = String(req.params.id)
    const setting = await LabTestSetting.findOne({
      where: { id, isDeleted: false },
    })
    if (!setting) {
      throw new HttpError(404, 'Lab test setting not found')
    }
    res.status(200).json({
      success: true,
      message: 'Lab test setting fetched successfully',
      data: formatLabTestSetting(setting),
    })
  } catch (err) {
    sendError(res, err, 'getLabTestSettingById')
  }
}

/**
 * POST /api/v1/lab-test-settings
 */
export async function createLabTestSetting(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const input = req.body as CreateLabTestSettingInput
    const createdBy = req.user?.id ?? null

    await assertNameIsFree(input.name.trim())

    const imageUrl = await resolveLabTestImage(req, input.imageUrl)

    const setting = await LabTestSetting.create({
      name: input.name.trim(),
      description: input.description.trim(),
      instructions: input.instructions?.trim() || null,
      imageUrl: imageUrl?.trim() || null,
      isActive: input.isActive ?? true,
      isDeleted: false,
      createdBy,
      updatedBy: createdBy,
    })

    res.status(201).json({
      success: true,
      message: 'Lab test setting created successfully',
      data: formatLabTestSetting(setting),
    })
  } catch (err) {
    sendError(res, err, 'createLabTestSetting')
  }
}

/**
 * PUT /api/v1/lab-test-settings/:id
 */
export async function updateLabTestSetting(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = String(req.params.id)
    const input = req.body as UpdateLabTestSettingInput
    const updatedBy = req.user?.id ?? null

    const setting = await LabTestSetting.findOne({ where: { id, isDeleted: false } })
    if (!setting) {
      throw new HttpError(404, 'Lab test setting not found')
    }

    if (input.name && input.name.trim() !== setting.name) {
      await assertNameIsFree(input.name.trim(), id)
    }

    const imageUrl = await resolveLabTestImage(req, input.imageUrl, setting.imageUrl)

    await setting.update({
      name: input.name ? input.name.trim() : setting.name,
      description: input.description !== undefined ? input.description.trim() : setting.description,
      instructions: input.instructions !== undefined ? input.instructions?.trim() || null : setting.instructions,
      imageUrl: imageUrl !== undefined ? imageUrl?.trim() || null : setting.imageUrl,
      isActive: input.isActive !== undefined ? input.isActive : setting.isActive,
      updatedBy,
    })

    await setting.reload()
    res.status(200).json({
      success: true,
      message: 'Lab test setting updated successfully',
      data: formatLabTestSetting(setting),
    })
  } catch (err) {
    sendError(res, err, 'updateLabTestSetting')
  }
}

/**
 * DELETE /api/v1/lab-test-settings/:id (soft)
 */
export async function deleteLabTestSetting(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = String(req.params.id)
    const deletedBy = req.user?.id ?? null

    const setting = await LabTestSetting.findOne({ where: { id, isDeleted: false } })
    if (!setting) {
      throw new HttpError(404, 'Lab test setting not found')
    }

    await setting.update({ isDeleted: true, isActive: false, updatedBy: deletedBy })

    res.status(200).json({
      success: true,
      message: 'Lab test setting deleted successfully',
    })
  } catch (err) {
    sendError(res, err, 'deleteLabTestSetting')
  }
}
