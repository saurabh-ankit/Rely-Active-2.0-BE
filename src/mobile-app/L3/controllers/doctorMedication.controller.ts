import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { DoctorAppointment, Property, UserLocation } from '../../../models/index.js'
import { listLocationMedicinesData } from '../../../services/residentMedication.service.js'
import { isAdminOrSuperAdmin } from './medical.controller.js'

async function assertLocationMedicineAccess(
  req: AuthenticatedRequest,
  locationId: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const userId = req.user?.id
  if (!userId) {
    return { ok: false, status: 401, message: 'Unauthorized' }
  }
  if (await isAdminOrSuperAdmin(req)) {
    return { ok: true }
  }

  const property = await Property.findByPk(locationId, { attributes: ['id'] })
  if (!property) {
    return { ok: false, status: 404, message: 'Location not found' }
  }

  const userLocation = await UserLocation.findOne({
    where: { userId, locId: locationId, isActive: true, isDeleted: false },
    attributes: ['id'],
  })
  if (userLocation) {
    return { ok: true }
  }

  const booking = await DoctorAppointment.findOne({
    where: { doctorId: userId, locationId, isDeleted: false },
    attributes: ['id'],
  })
  if (booking) {
    return { ok: true }
  }

  return {
    ok: false,
    status: 403,
    message: 'You do not have access to medicines for this location',
  }
}

/**
 * GET /doctor/locations/:locationId/medicines?search=&limit=&packType=&excludePackType=
 */
export async function listLocationMedicines(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const locationId = String(req.params.locationId || '').trim()
    if (!locationId) {
      res.status(400).json({ success: false, message: 'Location ID is required' })
      return
    }

    const access = await assertLocationMedicineAccess(req, locationId)
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message })
      return
    }

    const medicines = await listLocationMedicinesData(locationId, {
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      packType: typeof req.query.packType === 'string' ? req.query.packType : undefined,
      excludePackType: typeof req.query.excludePackType === 'string' ? req.query.excludePackType : undefined,
      limit: Number(req.query.limit) || undefined,
    })

    res.status(200).json({
      success: true,
      message: 'Medicines fetched successfully',
      data: { medicines },
    })
  } catch (err) {
    console.error('List Location Medicines Error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch medicines' })
  }
}
