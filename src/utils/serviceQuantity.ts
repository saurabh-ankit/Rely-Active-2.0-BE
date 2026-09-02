import { Venue } from '../models/index.js'
import type { AddOnService } from '../models/venue.model.js'

export const normalizeServiceQuantity = (quantity: unknown): number => {
  const parsed = parseInt(String(quantity ?? 1), 10)
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1
}

export const parsePositiveInt = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null
  const parsed = parseInt(String(value), 10)
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null
}

export async function getAllocatedQuantity(
  locId: string,
  globalServiceId: string,
  excludeVenueId?: string,
): Promise<number> {
  const venues = await Venue.findAll({
    where: { locationId: locId, isDeleted: false },
    attributes: ['id', 'addOnServices'],
  })

  let total = 0
  for (const venue of venues) {
    if (excludeVenueId && venue.id === excludeVenueId) continue
    const addOns = Array.isArray(venue.addOnServices) ? venue.addOnServices : []
    for (const addon of addOns as AddOnService[]) {
      if (addon.globalServiceId === globalServiceId) {
        total += normalizeServiceQuantity(addon.quantity)
      }
    }
  }
  return total
}

export async function getAllocatedQuantitiesByService(
  locId: string,
  excludeVenueId?: string,
): Promise<Map<string, number>> {
  const venues = await Venue.findAll({
    where: { locationId: locId, isDeleted: false },
    attributes: ['id', 'addOnServices'],
  })

  const totals = new Map<string, number>()
  for (const venue of venues) {
    if (excludeVenueId && venue.id === excludeVenueId) continue
    const addOns = Array.isArray(venue.addOnServices) ? venue.addOnServices : []
    for (const addon of addOns as AddOnService[]) {
      if (!addon.globalServiceId) continue
      const current = totals.get(addon.globalServiceId) ?? 0
      totals.set(addon.globalServiceId, current + normalizeServiceQuantity(addon.quantity))
    }
  }
  return totals
}
