import type { Request, Response } from 'express'
import { GlobalService, GlobalServiceProperty, Property } from '../../../models/index.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { uploadFileToS3, uploadBase64ToS3 } from '../../../middlewares/s3/index.js'
import {
  getAllocatedQuantitiesByService,
  getAllocatedQuantity,
  parsePositiveInt,
} from '../../../utils/serviceQuantity.js'

interface PropertyAssignmentInput {
  locId: string
  price?: number | string
  quantity?: number | string
}

function parsePropertyAssignments(raw: unknown): PropertyAssignmentInput[] {
  if (Array.isArray(raw)) {
    return raw as PropertyAssignmentInput[]
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function validatePropertyAssignments(
  assignments: PropertyAssignmentInput[],
):
  | { ok: true; assignments: Array<{ locId: string; price: number; quantity: number }> }
  | { ok: false; message: string } {
  const normalized: Array<{ locId: string; price: number; quantity: number }> = []

  for (const pa of assignments) {
    if (!pa.locId) continue
    const quantity = parsePositiveInt(pa.quantity)
    if (quantity === null) {
      return { ok: false, message: 'Quantity must be at least 1 for each assigned property' }
    }
    normalized.push({
      locId: pa.locId,
      price: Number(pa.price) || 0,
      quantity,
    })
  }

  return { ok: true, assignments: normalized }
}

async function validatePropertyQuantityReductions(
  globalServiceId: string,
  assignments: Array<{ locId: string; quantity: number }>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  for (const pa of assignments) {
    const allocated = await getAllocatedQuantity(pa.locId, globalServiceId)
    if (allocated > pa.quantity) {
      return {
        ok: false,
        message: `Cannot set quantity to ${pa.quantity}. ${allocated} units are already allocated across venues.`,
      }
    }
  }
  return { ok: true }
}

async function resolveImageUrl(
  req: AuthenticatedRequest,
  imageUrl: string | undefined,
  existingUrl: string | null,
): Promise<string | null> {
  if (req.file) {
    const s3Res = await uploadFileToS3(req.file, 'global-services')
    return s3Res.location
  }
  if (imageUrl !== undefined) {
    if (!imageUrl) return null
    return uploadBase64ToS3(imageUrl, 'global-services')
  }
  return existingUrl
}

export async function getAllGlobalServices(_req: Request, res: Response): Promise<void> {
  try {
    const services = await GlobalService.findAll({
      include: [
        {
          model: GlobalServiceProperty,
          as: 'propertyServices',
          include: [
            {
              model: Property,
              as: 'property',
              attributes: ['id', 'property_name', 'street', 'city', 'state'],
            },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
    })

    res.status(200).json({
      success: true,
      data: services,
    })
  } catch (error) {
    console.error('Error fetching global services:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch global services' })
  }
}

export async function getLocationGlobalServices(req: Request, res: Response): Promise<void> {
  try {
    const locationId = req.params.locationId as string

    const services = await GlobalService.findAll({
      where: { isActive: true },
      include: [
        {
          model: GlobalServiceProperty,
          as: 'propertyServices',
          where: { locId: locationId, isActive: true },
          required: true,
          attributes: ['id', 'locId', 'price', 'quantity', 'isActive'],
        },
      ],
      order: [['name', 'ASC']],
    })

    const allocatedByService = await getAllocatedQuantitiesByService(locationId)

    const data = services.map((service) => {
      const assignment = service.propertyServices?.[0]
      const json = service.toJSON() as GlobalService & {
        propertyServices?: GlobalServiceProperty[]
      }
      const locationQuantity = assignment ? Number(assignment.quantity) : 1
      const allocatedQuantity = allocatedByService.get(json.id) ?? 0
      const availableQuantity = Math.max(0, locationQuantity - allocatedQuantity)

      return {
        id: json.id,
        name: json.name,
        description: json.description,
        basePrice: json.basePrice,
        imageUrl: json.imageUrl,
        isActive: json.isActive,
        locationPrice: assignment ? Number(assignment.price) : json.basePrice,
        locationAssignmentId: assignment?.id ?? null,
        locationQuantity,
        allocatedQuantity,
        availableQuantity,
      }
    })

    res.status(200).json({
      success: true,
      message: 'Location global services fetched successfully',
      data,
    })
  } catch (error) {
    console.error('Error fetching location global services:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch location global services' })
  }
}

export async function createGlobalService(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { name, description, basePrice, imageUrl, isActive, propertyAssignments } = req.body

    const finalImageUrl = await resolveImageUrl(req, imageUrl, null)
    const parsedAssignments = parsePropertyAssignments(propertyAssignments)
    const validation = validatePropertyAssignments(parsedAssignments)
    if (!validation.ok) {
      res.status(400).json({ success: false, message: validation.message })
      return
    }

    const service = await GlobalService.create({
      name: name.trim(),
      description: description || null,
      basePrice: Number(basePrice) || 0,
      imageUrl: finalImageUrl,
      isActive: isActive !== undefined ? String(isActive) === 'true' || isActive === true : true,
      createdBy: req.user?.id || null,
    })

    for (const pa of validation.assignments) {
      await GlobalServiceProperty.create({
        locId: pa.locId,
        globalServiceId: service.id,
        price: pa.price || Number(basePrice) || 0,
        quantity: pa.quantity,
        isActive: true,
        createdBy: req.user?.id || null,
      })
    }

    const reloaded = await GlobalService.findByPk(service.id, {
      include: [
        {
          model: GlobalServiceProperty,
          as: 'propertyServices',
          include: [
            { model: Property, as: 'property', attributes: ['id', 'property_name', 'street', 'city', 'state'] },
          ],
        },
      ],
    })

    res.status(201).json({
      success: true,
      message: 'Global service created successfully',
      data: reloaded ? reloaded.toJSON() : service.toJSON(),
    })
  } catch (error) {
    console.error('Error creating global service:', error)
    res.status(500).json({ success: false, message: 'Failed to create global service' })
  }
}

export async function updateGlobalService(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const { name, description, basePrice, imageUrl, isActive, propertyAssignments } = req.body

    const service = await GlobalService.findByPk(id, {
      include: [{ model: GlobalServiceProperty, as: 'propertyServices' }],
    })
    if (!service) {
      res.status(404).json({ success: false, message: 'Global service not found' })
      return
    }

    const finalImageUrl = await resolveImageUrl(req, imageUrl, service.imageUrl)

    await service.update({
      name: name?.trim() || service.name,
      description: description !== undefined ? description || null : service.description,
      basePrice: basePrice !== undefined ? Number(basePrice) : service.basePrice,
      imageUrl: finalImageUrl,
      isActive: isActive !== undefined ? String(isActive) === 'true' || isActive === true : service.isActive,
      updatedBy: req.user?.id || null,
    })

    if (propertyAssignments !== undefined) {
      const parsedAssignments = parsePropertyAssignments(propertyAssignments)
      const validation = validatePropertyAssignments(parsedAssignments)
      if (!validation.ok) {
        res.status(400).json({ success: false, message: validation.message })
        return
      }

      const quantityCheck = await validatePropertyQuantityReductions(service.id, validation.assignments)
      if (!quantityCheck.ok) {
        res.status(400).json({ success: false, message: quantityCheck.message })
        return
      }

      const assignedLocIds = validation.assignments.map((pa) => pa.locId)

      for (const existing of service.propertyServices || []) {
        if (!assignedLocIds.includes(existing.locId)) {
          await existing.destroy()
        }
      }

      for (const pa of validation.assignments) {
        const existing = await GlobalServiceProperty.findOne({
          where: { locId: pa.locId, globalServiceId: service.id },
        })
        if (existing) {
          await existing.update({
            price: pa.price !== undefined ? Number(pa.price) : existing.price,
            quantity: pa.quantity,
            isActive: true,
            updatedBy: req.user?.id || null,
          })
        } else {
          await GlobalServiceProperty.create({
            locId: pa.locId,
            globalServiceId: service.id,
            price: pa.price || service.basePrice || 0,
            quantity: pa.quantity,
            isActive: true,
            createdBy: req.user?.id || null,
          })
        }
      }
    }

    const reloaded = await GlobalService.findByPk(service.id, {
      include: [
        {
          model: GlobalServiceProperty,
          as: 'propertyServices',
          include: [
            { model: Property, as: 'property', attributes: ['id', 'property_name', 'street', 'city', 'state'] },
          ],
        },
      ],
    })

    res.status(200).json({
      success: true,
      message: 'Global service updated successfully',
      data: reloaded ? reloaded.toJSON() : service.toJSON(),
    })
  } catch (error) {
    console.error('Error updating global service:', error)
    res.status(500).json({ success: false, message: 'Failed to update global service' })
  }
}

export async function deleteGlobalService(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const service = await GlobalService.findByPk(id)
    if (!service) {
      res.status(404).json({ success: false, message: 'Global service not found' })
      return
    }

    await GlobalServiceProperty.destroy({ where: { globalServiceId: id } })
    await service.destroy()

    res.status(200).json({ success: true, message: 'Global service deleted successfully' })
  } catch (error) {
    console.error('Error deleting global service:', error)
    res.status(500).json({ success: false, message: 'Failed to delete global service' })
  }
}
