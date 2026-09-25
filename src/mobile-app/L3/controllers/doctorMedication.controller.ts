import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import {
  DoctorAppointment,
  InventoryItem,
  InventoryItemLocation,
  Property,
  UserLocation,
} from '../../../models/index.js'
import { InventoryStock } from '../../../models/inventoryStock.model.js'
import { stockDisplay } from '../../../services/center-inventory.service.js'
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

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
    const packType = typeof req.query.packType === 'string' ? req.query.packType.trim().toLowerCase() : ''
    const excludePackType =
      typeof req.query.excludePackType === 'string' ? req.query.excludePackType.trim().toLowerCase() : ''
    const limitRaw = Number(req.query.limit)
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 100) : 50

    const links = await InventoryItemLocation.findAll({ where: { locationId } })
    const itemIds = links.map((l) => l.itemId)
    if (itemIds.length === 0) {
      res.status(200).json({
        success: true,
        message: 'Medicines fetched successfully',
        data: { medicines: [] },
      })
      return
    }

    const [items, stocks] = await Promise.all([
      InventoryItem.findAll({
        where: { id: itemIds, isActive: true },
        order: [['name', 'ASC']],
      }),
      InventoryStock.findAll({ where: { locationId } }),
    ])

    const stockMap = new Map(stocks.map((s) => [s.itemId, s.quantity]))
    const medicines = items
      .filter((item) => {
        if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false
        const itemPack = String(item.packType || '').toLowerCase()
        if (packType && itemPack !== packType) return false
        if (excludePackType && itemPack === excludePackType) return false
        return true
      })
      .slice(0, limit)
      .map((item) => {
        const quantity = stockMap.get(item.id) ?? 0
        return {
          id: item.id,
          name: item.name,
          packType: item.packType,
          packQuantity: item.packQuantity,
          packUnit: item.packUnit,
          quantity,
          stockDisplay: stockDisplay(quantity, item),
        }
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
