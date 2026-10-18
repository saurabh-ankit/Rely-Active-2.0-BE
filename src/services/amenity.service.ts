import { Op, type Transaction } from 'sequelize'
import sequelize from '../config/db/index.js'
import { Amenity, PropertyAmenity } from '../models/index.js'
import { HttpError } from '../middlewares/error/http-error.js'

export interface PropertyAmenitySelectionInput {
  amenityId: string
  slotBookable?: boolean
  settings?: Record<string, unknown> | null
}

export interface PropertyAmenityView {
  id: string
  amenityId: string
  name: string
  description: string | null
  slotBookable: boolean
  settings: Record<string, unknown> | null
  isActive: boolean
}

type PropertyAmenityWithAmenity = PropertyAmenity & { amenity?: Amenity | null }

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
    settings: (row.settings as Record<string, unknown> | null) ?? null,
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

      if (existing) {
        await existing.update(
          {
            slotBookable,
            settings: input.settings ?? null,
            isDeleted: false,
            isActive: true,
            updatedBy: operatingUserId,
          },
          { transaction },
        )
      } else {
        await PropertyAmenity.create(
          {
            propertyId,
            amenityId: input.amenityId,
            slotBookable,
            settings: input.settings ?? null,
            isDeleted: false,
            isActive: true,
            createdBy: operatingUserId,
            updatedBy: operatingUserId,
          },
          { transaction },
        )
      }
    }

    return getPropertyAmenities(propertyId, transaction)
  })
}
