import { ServiceType } from '../enums/billing.enum.js'
import type { AmenitySlotBooking, PropertyAmenity } from '../models/index.js'
import { isPastSlot } from '../utils/amenitySlot.util.js'
import { invoicedSourceIds } from './billing/invoicedSources.js'

/** What a new booking of this amenity costs (captured on the booking), or null when it's free. */
export function bookingChargeFor(propertyAmenity: PropertyAmenity): number | null {
  const price = Number(propertyAmenity.price)
  return propertyAmenity.isPayable && price > 0 ? price : null
}

/**
 * A paid booking can only be cancelled before its slot starts; after that it is billed to the flat.
 * Returns why it can't be cancelled (the slot has started, or it's already invoiced), or null.
 */
export async function bookingCancelBlockedReason(booking: AmenitySlotBooking): Promise<string | null> {
  if (!(Number(booking.chargeAmount) > 0)) return null
  if (isPastSlot(booking.date, booking.startMinutes)) {
    return 'A paid booking can only be cancelled before the slot starts'
  }
  if ((await invoicedSourceIds(ServiceType.AMENITY_BOOKING, [booking.id])).size) {
    return 'This booking is already on an invoice and can no longer be cancelled'
  }
  return null
}
