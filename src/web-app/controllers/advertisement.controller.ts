import type { Response } from 'express'
import { Op, type WhereOptions } from 'sequelize'
import { Advertisement } from '../../models/index.js'
import type { AdvertisementAttributes } from '../../models/advertisement.model.js'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { HttpError } from '../../middlewares/error/http-error.js'
import { uploadFileToS3 } from '../../middlewares/s3/index.js'

const ADVERTISEMENT_S3_FOLDER = 'advertisements'
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function sendError(res: Response, err: unknown, logLabel: string): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, message: err.message })
    return
  }
  console.error(logLabel, err)
  res.status(500).json({ success: false, message: err instanceof Error ? err.message : 'Unknown error' })
}

async function uploadImageFromRequest(req: AuthenticatedRequest): Promise<string | undefined> {
  const files = (req.files as Record<string, Express.Multer.File[]> | undefined) || {}
  const file = files.image?.[0]
  if (!file) return undefined
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    throw new HttpError(400, 'Image must be a JPEG, PNG, WebP or GIF file')
  }
  const uploaded = await uploadFileToS3(file, ADVERTISEMENT_S3_FOLDER)
  return uploaded.location
}

async function findAdvertisement(locationId: string, id: string): Promise<Advertisement> {
  const ad = await Advertisement.findOne({ where: { id, locationId, isDeleted: false } })
  if (!ad) throw new HttpError(404, 'Advertisement not found')
  return ad
}

/**
 * GET /api/v1/location/:locationId/advertisements
 * Query: search, isActive (true|false), page, limit
 */
export async function getAdvertisements(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const locationId = req.params.locationId as string
    const { search, isActive, page = '1', limit = '20' } = req.query as Record<string, string | undefined>

    const filters: WhereOptions<AdvertisementAttributes>[] = [{ locationId, isDeleted: false }]
    if (isActive === 'true' || isActive === 'false') filters.push({ isActive: isActive === 'true' })
    if (search && search.trim()) filters.push({ title: { [Op.like]: `%${search.trim()}%` } })

    const limitNum = Math.max(1, parseInt(String(limit)) || 20)
    const pageNum = Math.max(1, parseInt(String(page)) || 1)

    const { rows, count } = await Advertisement.findAndCountAll({
      where: { [Op.and]: filters },
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset: (pageNum - 1) * limitNum,
    })

    res.status(200).json({
      success: true,
      data: {
        advertisements: rows,
        pagination: { page: pageNum, limit: limitNum, total: count, totalPages: Math.ceil(count / limitNum) },
      },
    })
  } catch (err) {
    sendError(res, err, 'Get Advertisements Error:')
  }
}

/** GET /api/v1/location/:locationId/advertisements/:id */
export async function getAdvertisementById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ad = await findAdvertisement(req.params.locationId as string, req.params.id as string)
    res.status(200).json({ success: true, data: ad })
  } catch (err) {
    sendError(res, err, 'Get Advertisement Error:')
  }
}

/** POST /api/v1/location/:locationId/advertisements (multipart: title, description, image) */
export async function createAdvertisement(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const locationId = req.params.locationId as string
    const imageUrl = await uploadImageFromRequest(req)
    if (!imageUrl) throw new HttpError(400, 'Advertisement image is required')

    const ad = await Advertisement.create({
      locationId,
      title: req.body.title,
      description: req.body.description ?? null,
      imageUrl,
      createdBy: req.user?.id ?? null,
      updatedBy: req.user?.id ?? null,
    })

    res.status(201).json({ success: true, message: 'Advertisement created successfully', data: ad })
  } catch (err) {
    sendError(res, err, 'Create Advertisement Error:')
  }
}

/** PUT /api/v1/location/:locationId/advertisements/:id (multipart; image optional) */
export async function updateAdvertisement(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ad = await findAdvertisement(req.params.locationId as string, req.params.id as string)
    const imageUrl = await uploadImageFromRequest(req)

    await ad.update({
      ...(req.body.title !== undefined ? { title: req.body.title } : {}),
      ...('description' in req.body ? { description: req.body.description ?? null } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      updatedBy: req.user?.id ?? null,
    })

    res.status(200).json({ success: true, message: 'Advertisement updated successfully', data: ad })
  } catch (err) {
    sendError(res, err, 'Update Advertisement Error:')
  }
}

/** PATCH /api/v1/location/:locationId/advertisements/:id/status  body: { isActive } */
export async function updateAdvertisementStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ad = await findAdvertisement(req.params.locationId as string, req.params.id as string)
    await ad.update({ isActive: req.body.isActive, updatedBy: req.user?.id ?? null })
    res.status(200).json({
      success: true,
      message: ad.isActive ? 'Advertisement activated' : 'Advertisement deactivated',
      data: ad,
    })
  } catch (err) {
    sendError(res, err, 'Update Advertisement Status Error:')
  }
}

/** DELETE /api/v1/location/:locationId/advertisements/:id (soft delete) */
export async function deleteAdvertisement(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ad = await findAdvertisement(req.params.locationId as string, req.params.id as string)
    await ad.update({ isDeleted: true, updatedBy: req.user?.id ?? null })
    res.status(200).json({ success: true, message: 'Advertisement deleted successfully' })
  } catch (err) {
    sendError(res, err, 'Delete Advertisement Error:')
  }
}
