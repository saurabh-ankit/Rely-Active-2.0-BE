import type { Response } from 'express'
import { Op, Sequelize } from 'sequelize'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { GlobalServiceProperty, Property, Venue } from '../../../models/index.js'
import type { AddOnService } from '../../../models/venue.model.js'
import { parseJsonBodyField } from '../../../utils/parseBodyField.js'
import { getUploadedFilePath, getUploadedFilePaths } from '../../../utils/uploadHelper.js'
import { errorResponse, successResponse } from '../../../utils/response/index.js'
import { getAllocatedQuantity, parsePositiveInt } from '../../../utils/serviceQuantity.js'

type VenueImage = { url: string; caption?: string }

const parseVenueJsonFields = (body: Record<string, unknown>) => ({
  images: parseJsonBodyField<VenueImage[]>(body.images),
  addOnServices: parseJsonBodyField<AddOnService[]>(body.addOnServices),
})

async function validateVenueAddOnServices(
  locationId: string,
  addOnServices: AddOnService[] | null | undefined,
  excludeVenueId?: string,
): Promise<{ ok: true; services: AddOnService[] | null } | { ok: false; error: string }> {
  if (addOnServices === undefined || addOnServices === null) {
    return { ok: true, services: null }
  }
  if (!Array.isArray(addOnServices)) {
    return { ok: false, error: 'addOnServices must be an array' }
  }
  if (addOnServices.length === 0) {
    return { ok: true, services: [] }
  }

  const validated: AddOnService[] = []

  for (const item of addOnServices) {
    if (!item || typeof item.name !== 'string' || !item.name.trim()) {
      return { ok: false, error: 'Each add-on service must have a name' }
    }

    const quantity = parsePositiveInt(item.quantity)
    if (quantity === null) {
      return { ok: false, error: `Quantity must be at least 1 for service "${item.name}"` }
    }

    if (item.globalServiceId) {
      const assignment = await GlobalServiceProperty.findOne({
        where: { locId: locationId, globalServiceId: item.globalServiceId, isActive: true },
      })
      if (!assignment) {
        return { ok: false, error: `Service "${item.name}" is not assigned to this location` }
      }

      const otherAllocated = await getAllocatedQuantity(locationId, item.globalServiceId, excludeVenueId)
      const propertyQuantity = Number(assignment.quantity)
      if (otherAllocated + quantity > propertyQuantity) {
        const available = Math.max(0, propertyQuantity - otherAllocated)
        return {
          ok: false,
          error: `Quantity for "${item.name}" exceeds available stock (${available} remaining)`,
        }
      }
    }

    validated.push({
      ...item,
      name: item.name.trim(),
      quantity,
    })
  }

  return { ok: true, services: validated }
}

export const createVenue = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, occupancy, price, keyFeatures, otherServices } = req.body
    const { images, addOnServices } = parseVenueJsonFields(req.body)
    const createdBy = req.user?.id
    const locationId = req.params.locationId as string

    if (!createdBy) {
      return res.status(401).json(errorResponse('User not authenticated'))
    }

    const location = await Property.findByPk(locationId)
    if (!location) {
      return res.status(404).json(errorResponse('Location not found'))
    }

    const existingVenue = await Venue.findOne({
      where: { name, locationId, isDeleted: false },
    })

    if (existingVenue) {
      return res.status(400).json(errorResponse('Venue name already exists in this location'))
    }

    const coverPhoto = getUploadedFilePath(req, 'coverPhoto') || ''
    const uploadedImages = getUploadedFilePaths(req, 'images').map((url) => ({ url }))

    let finalImages = uploadedImages
    if (images && Array.isArray(images) && images.length > 0) {
      if (uploadedImages.length > 0) {
        finalImages = uploadedImages.map((uploaded, index) => {
          const bodyImage = images[index]
          if (bodyImage?.caption) {
            return { url: uploaded.url, caption: bodyImage.caption }
          }
          return uploaded
        })
      } else {
        finalImages = images
      }
    }

    const addOnValidation = await validateVenueAddOnServices(locationId, addOnServices)
    if (!addOnValidation.ok) {
      return res.status(400).json(errorResponse(addOnValidation.error))
    }

    const venue = await Venue.create({
      name,
      occupancy: occupancy !== undefined ? parseInt(String(occupancy), 10) : occupancy,
      price: price !== undefined ? Number(price) || 0 : 0,
      keyFeatures,
      otherServices,
      coverPhoto,
      images: finalImages.length > 0 ? finalImages : null,
      addOnServices: addOnValidation.services ?? null,
      locationId,
      createdBy,
      updatedBy: createdBy,
    })

    return res.status(201).json(successResponse('Venue created successfully', venue))
  } catch (error) {
    console.error('Create Venue Error:', error)
    return res.status(500).json(errorResponse('Failed to create venue'))
  }
}

export const getAllVenues = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = req.params.locationId as string
    const { page = 1, limit = 10, search, sortBy = 'createdAt', sortOrder = 'DESC' } = req.query

    const offset = (parseInt(String(page)) - 1) * parseInt(String(limit))
    const whereClause: Record<string, unknown> = {
      locationId,
      isDeleted: false,
    }

    if (search) {
      const searchTerm = String(search).trim()
      whereClause[Op.or as unknown as string] = [
        Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('Venue.name')), {
          [Op.like]: `%${searchTerm.toLowerCase()}%`,
        }),
      ]
    }

    const { count, rows } = await Venue.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Property,
          as: 'location',
          attributes: ['id', 'property_name'],
        },
      ],
      order: [[String(sortBy), String(sortOrder)]],
      limit: parseInt(String(limit)),
      offset,
    })

    return res.status(200).json(
      successResponse('Venues fetched successfully', {
        venues: rows,
        pagination: {
          page: parseInt(String(page)),
          limit: parseInt(String(limit)),
          total: count,
          totalPages: Math.ceil(count / parseInt(String(limit))),
        },
      }),
    )
  } catch (error) {
    console.error('Get All Venues Error:', error)
    return res.status(500).json(errorResponse('Failed to fetch venues'))
  }
}

export const getVenueById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const locationId = req.params.locationId as string

    const venue = await Venue.findOne({
      where: { id, locationId, isDeleted: false },
      include: [
        {
          model: Property,
          as: 'location',
          attributes: ['id', 'property_name'],
        },
      ],
    })

    if (!venue) {
      return res.status(404).json(errorResponse('Venue not found'))
    }

    return res.status(200).json(successResponse('Venue fetched successfully', venue))
  } catch (error) {
    console.error('Get Venue Error:', error)
    return res.status(500).json(errorResponse('Failed to fetch venue'))
  }
}

export const updateVenue = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const locationId = req.params.locationId as string
    const { name, occupancy, price, keyFeatures, otherServices } = req.body
    const { images, addOnServices } = parseVenueJsonFields(req.body)
    const updatedBy = req.user?.id

    if (!updatedBy) {
      return res.status(401).json(errorResponse('User not authenticated'))
    }

    const venue = await Venue.findOne({
      where: { id, locationId, isDeleted: false },
    })

    if (!venue) {
      return res.status(404).json(errorResponse('Venue not found'))
    }

    if (name && name !== venue.name) {
      const existingVenue = await Venue.findOne({
        where: {
          name,
          locationId,
          id: { [Op.ne]: id },
          isDeleted: false,
        },
      })

      if (existingVenue) {
        return res.status(400).json(errorResponse('Venue name already exists in this location'))
      }
    }

    const coverPhoto = getUploadedFilePath(req, 'coverPhoto')
    const uploadedImages = getUploadedFilePaths(req, 'images').map((url) => ({ url }))

    let finalImages: Array<{ url: string; caption?: string }> | undefined
    if (uploadedImages.length > 0) {
      if (images && Array.isArray(images) && images.length > 0) {
        finalImages = uploadedImages.map((uploaded, index) => {
          const bodyImage = images[index]
          if (bodyImage?.caption) {
            return { url: uploaded.url, caption: bodyImage.caption }
          }
          return uploaded
        })
      } else {
        finalImages = uploadedImages
      }
    } else if (images !== undefined) {
      finalImages = images
    }

    let validatedAddOnServices: AddOnService[] | null | undefined
    if (addOnServices !== undefined) {
      const addOnValidation = await validateVenueAddOnServices(locationId, addOnServices, id)
      if (!addOnValidation.ok) {
        return res.status(400).json(errorResponse(addOnValidation.error))
      }
      validatedAddOnServices = addOnValidation.services
    }

    await venue.update({
      name: name || venue.name,
      occupancy: occupancy !== undefined ? parseInt(String(occupancy), 10) : venue.occupancy,
      price: price !== undefined ? Number(price) : venue.price,
      keyFeatures: keyFeatures || venue.keyFeatures,
      otherServices: otherServices !== undefined ? otherServices : venue.otherServices,
      coverPhoto: coverPhoto !== undefined ? coverPhoto : venue.coverPhoto,
      images: finalImages !== undefined ? finalImages : venue.images,
      addOnServices: validatedAddOnServices !== undefined ? validatedAddOnServices : venue.addOnServices,
      updatedBy,
    })

    return res.status(200).json(successResponse('Venue updated successfully', venue))
  } catch (error) {
    console.error('Update Venue Error:', error)
    return res.status(500).json(errorResponse('Failed to update venue'))
  }
}

export const deleteVenue = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const locationId = req.params.locationId as string
    const updatedBy = req.user?.id

    if (!updatedBy) {
      return res.status(401).json(errorResponse('User not authenticated'))
    }

    const venue = await Venue.findOne({
      where: { id, locationId, isDeleted: false },
    })

    if (!venue) {
      return res.status(404).json(errorResponse('Venue not found'))
    }

    await venue.update({ isDeleted: true, updatedBy })

    return res.status(200).json(successResponse('Venue deleted successfully'))
  } catch (error) {
    console.error('Delete Venue Error:', error)
    return res.status(500).json(errorResponse('Failed to delete venue'))
  }
}
