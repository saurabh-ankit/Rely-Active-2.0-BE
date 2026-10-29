import { Op, type Transaction } from 'sequelize'
import sequelize from '../config/db/index.js'
import { Amenity, AmenitySlotBooking, AmenitySlotConfig, PropertyAmenity } from '../models/index.js'
import { HttpError } from '../middlewares/error/http-error.js'
import { AmenityBookingStatus } from '../models/amenitySlotBooking.model.js'
import { generateSlotStartMinutes } from '../utils/amenitySlot.util.js'
import { businessClock } from '../utils/roster.util.js'
import { slotSetupFromSettings, unitOf } from './amenityBooking.service.js'

export interface PropertyAmenitySelectionInput {
  amenityId: string
  slotBookable?: boolean
  isPayable?: boolean
  price?: number | null
  settings?: Record<string, unknown> | null
}

export interface PropertyAmenityView {
  id: string
  amenityId: string
  name: string
  description: string | null
  slotBookable: boolean
  isPayable: boolean
  /** Price per booked slot; null when the amenity is free. */
  price: number | null
  settings: Record<string, unknown> | null
  /** The saved slot setup, so the property form can show amenities set up before booking units. */
  slotSetup: {
    bookingUnit: string
    openMinutes: number
    closeMinutes: number
    durationMin: number
    checkOutMinutes: number | null
  } | null
  isActive: boolean
}

type PropertyAmenityWithAmenity = PropertyAmenity & {
  amenity?: Amenity | null
  slotConfig?: AmenitySlotConfig | null
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

function toView(row: PropertyAmenityWithAmenity): PropertyAmenityView | null {
  const amenity = row.amenity
  if (!amenity || amenity.isDeleted) return null
  return {
    id: row.id,
    amenityId: amenity.id,
    name: amenity.name,
    description: amenity.description ?? null,
    slotBookable: Boolean(row.slotBookable),
    isPayable: Boolean(row.isPayable),
    price: row.isPayable && row.price != null ? Number(row.price) : null,
    settings: (row.settings as Record<string, unknown> | null) ?? null,
    slotSetup: row.slotConfig
      ? {
          bookingUnit: unitOf(row.slotConfig),
          openMinutes: row.slotConfig.openMinutes,
          closeMinutes: row.slotConfig.closeMinutes,
          durationMin: row.slotConfig.durationMin,
          checkOutMinutes: row.slotConfig.checkOutMinutes ?? null,
        }
      : null,
    isActive: Boolean(row.isActive),
  }
}

async function loadRows(propertyId: string, transaction?: Transaction): Promise<PropertyAmenityWithAmenity[]> {
  return (await PropertyAmenity.findAll({
    where: { propertyId, isDeleted: false },
    include: [
      {
        model: Amenity,
        as: 'amenity',
        required: false,
      },
      {
        model: AmenitySlotConfig,
        as: 'slotConfig',
        where: { isDeleted: false },
        required: false,
      },
    ],
    order: [['createdAt', 'ASC']],
    ...(transaction ? { transaction } : {}),
  })) as PropertyAmenityWithAmenity[]
}

export async function getPropertyAmenities(
  propertyId: string,
  transaction?: Transaction,
): Promise<PropertyAmenityView[]> {
  const rows = await loadRows(propertyId, transaction)
  return rows
    .map(toView)
    .filter((v): v is PropertyAmenityView => !!v)
    .sort(byName)
}

export function toLegacyAmenityNames(propertyAmenities: PropertyAmenityView[]): string[] {
  return Array.from(new Set(propertyAmenities.map((item) => item.name.trim()).filter(Boolean)))
}

/**
 * Writes the booking unit and times chosen on the property to the amenity's slot setup (creating it
 * with one booking per slot and every day open). Refuses a change that upcoming bookings no longer fit.
 */
async function applySlotSetup(
  propertyAmenityId: string,
  amenityName: string,
  settings: Record<string, unknown> | null | undefined,
  operatingUserId: string | null,
  transaction: Transaction,
): Promise<void> {
  const setup = slotSetupFromSettings(settings)
  if (!setup) return

  const config = await AmenitySlotConfig.findOne({ where: { propertyAmenityId, isDeleted: false }, transaction })
  if (!config) {
    await AmenitySlotConfig.create(
      {
        propertyAmenityId,
        ...setup,
        capacity: 1,
        isActive: true,
        isDeleted: false,
        createdBy: operatingUserId,
        updatedBy: operatingUserId,
      },
      { transaction },
    )
    return
  }

  const unchanged =
    unitOf(config) === setup.bookingUnit &&
    config.openMinutes === setup.openMinutes &&
    config.closeMinutes === setup.closeMinutes &&
    config.durationMin === setup.durationMin &&
    (config.checkOutMinutes ?? null) === setup.checkOutMinutes
  if (unchanged) return

  const upcoming = await AmenitySlotBooking.findAll({
    where: {
      slotConfigId: config.id,
      status: AmenityBookingStatus.BOOKED,
      isDeleted: false,
      date: { [Op.gte]: businessClock().ymd },
    },
    attributes: ['id', 'startMinutes'],
    transaction,
  })
  const starts = generateSlotStartMinutes(setup.openMinutes, setup.closeMinutes, setup.durationMin)
  const impacted =
    unitOf(config) === setup.bookingUnit ? upcoming.filter((b) => !starts.includes(b.startMinutes)) : upcoming
  if (impacted.length) {
    throw new HttpError(
      409,
      `${amenityName} has ${impacted.length} upcoming booking${impacted.length === 1 ? '' : 's'} that ${
        impacted.length === 1 ? "doesn't" : "don't"
      } fit the new booking setup. Cancel ${impacted.length === 1 ? 'it' : 'them'} first, or keep the current setup.`,
    )
  }
  await config.update({ ...setup, updatedBy: operatingUserId }, { transaction })
}

export async function syncPropertyAmenities(
  propertyId: string,
  amenities: PropertyAmenitySelectionInput[],
  operatingUserId: string | null,
): Promise<PropertyAmenityView[]> {
  return sequelize.transaction(async (transaction) => {
    const uniqueAmenityIds = Array.from(new Set(amenities.map((item) => item.amenityId)))

    const amenityRows = await Amenity.findAll({
      where: { id: { [Op.in]: uniqueAmenityIds }, isDeleted: false },
      transaction,
    })
    const amenityById = new Map(amenityRows.map((row) => [row.id, row]))

    if (amenityById.size !== uniqueAmenityIds.length) {
      const missing = uniqueAmenityIds.filter((id) => !amenityById.has(id))
      throw new HttpError(400, `Invalid amenities: ${missing.join(', ')}`)
    }

    const existingRows = await PropertyAmenity.findAll({
      where: { propertyId },
      transaction,
    })
    const existingByAmenityId = new Map(existingRows.map((row) => [row.amenityId, row]))
    const requestedIds = new Set(uniqueAmenityIds)

    for (const row of existingRows) {
      if (requestedIds.has(row.amenityId)) continue
      if (!row.isDeleted || row.isActive) {
        await row.update(
          {
            isDeleted: true,
            isActive: false,
            updatedBy: operatingUserId,
          },
          { transaction },
        )
      }
    }

    for (const input of amenities) {
      const amenity = amenityById.get(input.amenityId)
      if (!amenity) continue
      const existing = existingByAmenityId.get(input.amenityId)
      const slotBookable = input.slotBookable ?? false
      const isPayable = slotBookable && !!input.isPayable
      const price = isPayable ? (input.price ?? null) : null

      let propertyAmenityId: string
      if (existing) {
        propertyAmenityId = existing.id
        await existing.update(
          {
            slotBookable,
            isPayable,
            price,
            settings: input.settings ?? null,
            isDeleted: false,
            isActive: true,
            updatedBy: operatingUserId,
          },
          { transaction },
        )
      } else {
        const created = await PropertyAmenity.create(
          {
            propertyId,
            amenityId: input.amenityId,
            slotBookable,
            isPayable,
            price,
            settings: input.settings ?? null,
            isDeleted: false,
            isActive: true,
            createdBy: operatingUserId,
            updatedBy: operatingUserId,
          },
          { transaction },
        )
        propertyAmenityId = created.id
      }

      if (slotBookable) {
        await applySlotSetup(propertyAmenityId, amenity.name, input.settings, operatingUserId, transaction)
      }
    }

    return getPropertyAmenities(propertyId, transaction)
  })
}
