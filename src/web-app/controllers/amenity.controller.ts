import type { Response } from 'express'
import { Op, type WhereOptions } from 'sequelize'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { HttpError } from '../../middlewares/error/http-error.js'
import { Amenity, Property, PropertyAmenity } from '../../models/index.js'
import {
  getPropertyAmenities,
  syncPropertyAmenities,
  type PropertyAmenitySelectionInput,
} from '../../services/amenity.service.js'
import {
  type CreateAmenityInput,
  type SetPropertyAmenitiesInput,
  type UpdateAmenityInput,
} from '../../validations/amenity.validation.js'

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
  res.status(500).json({ success: false, message: err instanceof Error ? err.message : 'Unknown error' })
}

function formatAmenity(amenity: Amenity): Record<string, unknown> {
  return {
    id: amenity.id,
    name: amenity.name,
    description: amenity.description,
    isActive: amenity.isActive,
    createdAt: amenity.createdAt,
    updatedAt: amenity.updatedAt,
  }
}

async function assertNameIsFree(name: string, excludeId?: string): Promise<void> {
  const clash = await Amenity.findOne({
    where: {
      name,
      isDeleted: false,
      ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
    },
  })
  if (clash) {
    throw new HttpError(409, `An amenity named "${name}" already exists`)
  }
}

async function findVisibleAmenity(id: string): Promise<Amenity> {
  const amenity = await Amenity.findOne({ where: { id, isDeleted: false } })
  if (!amenity) {
    throw new HttpError(404, 'Amenity not found')
  }
  return amenity
}

/**
 * GET /api/v1/amenities
 * Query: search, isActive
 */
export async function getAllAmenities(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { search, isActive } = req.query as Record<string, string | undefined>

    const filters: WhereOptions[] = [{ isDeleted: false }]
    if (isActive === 'true' || isActive === 'false') {
      filters.push({ isActive: isActive === 'true' })
    }
    if (search && search.trim()) {
      const q = `%${search.trim()}%`
      filters.push({ [Op.or]: [{ name: { [Op.like]: q } }, { description: { [Op.like]: q } }] })
    }

    const amenities = await Amenity.findAll({
      where: { [Op.and]: filters },
      order: [
        ['isActive', 'DESC'],
        ['name', 'ASC'],
      ],
    })

    res.status(200).json({ success: true, data: amenities.map(formatAmenity) })
  } catch (err: unknown) {
    sendError(res, err, 'Error fetching amenities:')
  }
}

/** GET /api/v1/amenities/:id */
export async function getAmenityById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const amenity = await findVisibleAmenity(req.params.id as string)
    res.status(200).json({ success: true, data: formatAmenity(amenity) })
  } catch (err: unknown) {
    sendError(res, err, 'Error fetching amenity:')
  }
}

/** POST /api/v1/amenities */
export async function createAmenity(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { name, description, isActive } = req.body as CreateAmenityInput
    const finalName = name.trim()

    const deleted = await Amenity.findOne({ where: { name: finalName, isDeleted: true } })
    let amenity: Amenity
    if (deleted) {
      deleted.name = finalName
      deleted.description = description ?? null
      deleted.isActive = isActive ?? true
      deleted.isDeleted = false
      deleted.updatedBy = req.user?.id || null
      await deleted.save()
      amenity = deleted
    } else {
      await assertNameIsFree(finalName)
      amenity = await Amenity.create({
        name: finalName,
        description: description ?? null,
        isActive: isActive ?? true,
        createdBy: req.user?.id || null,
        updatedBy: req.user?.id || null,
      })
    }

    res.status(201).json({
      success: true,
      message: 'Amenity created successfully',
      data: formatAmenity(amenity),
    })
  } catch (err: unknown) {
    sendError(res, err, 'Error creating amenity:')
  }
}

/** PUT /api/v1/amenities/:id */
export async function updateAmenity(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const amenity = await findVisibleAmenity(req.params.id as string)
    const { name, description, isActive } = req.body as UpdateAmenityInput

    if (name !== undefined && name.trim() !== amenity.name) {
      await assertNameIsFree(name.trim(), amenity.id)
      amenity.name = name.trim()
    }
    if (description !== undefined) amenity.description = description ?? null
    if (isActive !== undefined) amenity.isActive = isActive
    amenity.updatedBy = req.user?.id || null

    await amenity.save()
    res.status(200).json({
      success: true,
      message: 'Amenity updated successfully',
      data: formatAmenity(amenity),
    })
  } catch (err: unknown) {
    sendError(res, err, 'Error updating amenity:')
  }
}

/** PATCH /api/v1/amenities/:id/status */
export async function updateAmenityStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const amenity = await findVisibleAmenity(req.params.id as string)
    const { isActive } = req.body as { isActive: boolean }

    amenity.isActive = isActive
    amenity.updatedBy = req.user?.id || null
    await amenity.save()

    res.status(200).json({
      success: true,
      message: isActive ? 'Amenity activated successfully' : 'Amenity deactivated successfully',
      data: formatAmenity(amenity),
    })
  } catch (err: unknown) {
    sendError(res, err, 'Error updating amenity status:')
  }
}

/** DELETE /api/v1/amenities/:id */
export async function deleteAmenity(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const amenity = await findVisibleAmenity(req.params.id as string)

    const propertyUsage = await PropertyAmenity.count({ where: { amenityId: amenity.id, isDeleted: false } })
    if (propertyUsage > 0) {
      throw new HttpError(
        409,
        `Cannot delete: this amenity is assigned to ${propertyUsage} propert${propertyUsage === 1 ? 'y' : 'ies'}. Deactivate it instead.`,
      )
    }

    amenity.isDeleted = true
    amenity.isActive = false
    amenity.updatedBy = req.user?.id || null
    await amenity.save()

    res.status(200).json({ success: true, message: 'Amenity deleted successfully' })
  } catch (err: unknown) {
    sendError(res, err, 'Error deleting amenity:')
  }
}

/** GET /api/v1/property/:id/amenities */
export async function getPropertyAmenitiesForProperty(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const propertyId = req.params.id as string
    const property = await Property.findOne({ where: { id: propertyId, isDeleted: false } })
    if (!property) {
      throw new HttpError(404, 'Property not found')
    }

    const amenities = await getPropertyAmenities(propertyId)
    res.status(200).json({ success: true, data: amenities })
  } catch (err: unknown) {
    sendError(res, err, 'Error fetching property amenities:')
  }
}

/** PUT /api/v1/property/:id/amenities */
export async function setPropertyAmenitiesForProperty(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const propertyId = req.params.id as string
    const { amenities } = req.body as SetPropertyAmenitiesInput

    const property = await Property.findOne({ where: { id: propertyId, isDeleted: false } })
    if (!property) {
      throw new HttpError(404, 'Property not found')
    }

    const mapped = amenities.map((item) => ({
      amenityId: item.amenityId,
      slotBookable: item.slotBookable,
      isPayable: item.isPayable,
      price: item.price,
      settings: item.settings,
    })) as PropertyAmenitySelectionInput[]

    const savedAmenities = await syncPropertyAmenities(propertyId, mapped, req.user?.id || null)
    await property.update({
      amenities: savedAmenities.map((item) => item.name),
      updatedBy: req.user?.id || null,
    })

    res.status(200).json({
      success: true,
      message: 'Property amenities updated successfully',
      data: savedAmenities,
    })
  } catch (err: unknown) {
    sendError(res, err, 'Error saving property amenities:')
  }
}
