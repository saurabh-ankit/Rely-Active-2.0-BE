import type { Transaction } from 'sequelize'
import sequelize from '../config/db/index.js'
import { HttpError } from '../middlewares/error/http-error.js'
import { InventoryItem, InventoryItemLocation, ResidentMedication } from '../models/index.js'
import { InventoryStock } from '../models/inventoryStock.model.js'
import type { ConsultantMedicationEntry } from '../models/consultant.model.js'
import type { MedicationTiming } from '../models/residentMedication.model.js'
import type {
  CreateResidentMedicationInput,
  UpdateResidentMedicationInput,
} from '../validations/residentMedication.validation.js'
import { stockDisplay } from './center-inventory.service.js'
import { patchConsultantEntry } from './consultantEntry.service.js'
import { formatMedicationRow, getClinicalResident } from './residentClinical.service.js'

/**
 * Keep resident_medications in sync with consultant.medications JSON for an appointment.
 * Uses the same entry ids so charts and diagnosis share stable medication ids.
 */
export async function syncAppointmentMedications(params: {
  residentId: string
  locationId: string
  appointmentId: string
  medications: ConsultantMedicationEntry[]
  userId?: string | null
  transaction?: Transaction
}): Promise<void> {
  const { residentId, locationId, appointmentId, medications, userId, transaction } = params
  const keepIds = new Set(medications.map((m) => m.id))

  const existing = await ResidentMedication.findAll({
    where: { appointmentId, isDeleted: false },
    ...(transaction ? { transaction } : {}),
  })

  for (const row of existing) {
    if (!keepIds.has(row.id)) {
      row.isDeleted = true
      row.isActive = false
      row.updatedBy = userId || null
      await row.save(transaction ? { transaction } : undefined)
    }
  }

  for (const med of medications) {
    const payload = {
      residentId,
      locationId,
      appointmentId,
      inventoryItemId: med.inventoryItemId,
      medicineName: med.medicineName,
      startDate: med.startDate,
      endDate: med.isUntilDischarge ? null : med.endDate,
      isUntilDischarge: Boolean(med.isUntilDischarge),
      timings: med.timings || [],
      note: med.note || null,
      isActive: true,
      isDeleted: false,
      updatedBy: userId || null,
    }

    const found = await ResidentMedication.findOne({
      where: { id: med.id },
      ...(transaction ? { transaction } : {}),
    })

    if (found) {
      Object.assign(found, payload)
      await found.save(transaction ? { transaction } : undefined)
    } else {
      await ResidentMedication.create(
        {
          id: med.id,
          ...payload,
          createdBy: userId || null,
        },
        transaction ? { transaction } : undefined,
      )
    }
  }
}

// ── Medicine lookup (shared by medication and insulin) ───────────────────────

export interface LocationMedicineFilters {
  search?: string | undefined
  packType?: string | undefined
  excludePackType?: string | undefined
  limit?: number | undefined
}

/**
 * Active inventory items linked to a location, with current stock, for the medicine picker.
 */
export async function listLocationMedicinesData(locationId: string, filters: LocationMedicineFilters = {}) {
  const search = filters.search?.trim().toLowerCase() || ''
  const packType = filters.packType?.trim().toLowerCase() || ''
  const excludePackType = filters.excludePackType?.trim().toLowerCase() || ''
  const limit = filters.limit && filters.limit > 0 ? Math.min(Math.floor(filters.limit), 100) : 50

  const links = await InventoryItemLocation.findAll({ where: { locationId } })
  const itemIds = links.map((l) => l.itemId)
  if (itemIds.length === 0) return []

  const [items, stocks] = await Promise.all([
    InventoryItem.findAll({
      where: { id: itemIds, isActive: true },
      order: [['name', 'ASC']],
    }),
    InventoryStock.findAll({ where: { locationId } }),
  ])

  const stockMap = new Map(stocks.map((s) => [s.itemId, s.quantity]))
  return items
    .filter((item) => {
      if (search && !item.name.toLowerCase().includes(search)) return false
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
}

export interface MedicationValues {
  inventoryItemId: string
  medicineName: string
  startDate: string
  endDate: string | null
  isUntilDischarge: boolean
  timings: MedicationTiming[]
  note: string | null
}

/**
 * Merge a create/update payload onto the existing row values and validate it.
 * The inventory item is only re-checked against the location when it changes.
 */
export async function resolveMedicationValues(params: {
  locationId: string
  input: CreateResidentMedicationInput | UpdateResidentMedicationInput
  existing?: MedicationValues
  requiredPackType?: string
  label: string
}): Promise<MedicationValues> {
  const { locationId, input, existing, requiredPackType, label } = params

  const inventoryItemId = input.inventoryItemId ?? existing?.inventoryItemId
  if (!inventoryItemId) {
    throw new HttpError(400, `Medicine is required for ${label}`)
  }

  let medicineName = existing?.medicineName ?? ''
  if (!existing || inventoryItemId !== existing.inventoryItemId) {
    const [link, item] = await Promise.all([
      InventoryItemLocation.findOne({ where: { locationId, itemId: inventoryItemId } }),
      InventoryItem.findByPk(inventoryItemId),
    ])
    if (!link || !item || !item.isActive) {
      throw new HttpError(400, 'Selected medicine is not available at this location')
    }
    if (requiredPackType && String(item.packType || '').toLowerCase() !== requiredPackType) {
      throw new HttpError(400, `Selected item must be packType "${requiredPackType}" for ${label}`)
    }
    medicineName = item.name
  }

  const startDate = input.startDate ?? existing?.startDate
  if (!startDate) {
    throw new HttpError(400, 'Start date is required')
  }

  const isUntilDischarge = input.isUntilDischarge ?? existing?.isUntilDischarge ?? false
  const endDate = isUntilDischarge ? null : ((input.endDate !== undefined ? input.endDate : existing?.endDate) ?? null)
  if (!isUntilDischarge && !endDate) {
    throw new HttpError(400, 'End date is required when not until discharge')
  }
  if (endDate && endDate < startDate) {
    throw new HttpError(400, 'End date must be on or after start date')
  }

  return {
    inventoryItemId,
    medicineName,
    startDate,
    endDate,
    isUntilDischarge,
    timings: input.timings ?? existing?.timings ?? [],
    note: input.note !== undefined ? input.note?.trim() || null : (existing?.note ?? null),
  }
}

export function toConsultantMedicationEntry(id: string, values: MedicationValues): ConsultantMedicationEntry {
  return { id, ...values }
}

function medicationValuesOf(row: ResidentMedication): MedicationValues {
  return {
    inventoryItemId: row.inventoryItemId,
    medicineName: row.medicineName,
    startDate: row.startDate,
    endDate: row.endDate,
    isUntilDischarge: Boolean(row.isUntilDischarge),
    timings: Array.isArray(row.timings) ? row.timings : [],
    note: row.note,
  }
}

async function findResidentMedication(residentId: string, id: string): Promise<ResidentMedication> {
  const row = await ResidentMedication.findOne({ where: { id, residentId, isDeleted: false } })
  if (!row) {
    throw new HttpError(404, 'Medication not found')
  }
  return row
}

export async function createResidentMedication(params: {
  residentId: string
  input: CreateResidentMedicationInput
  userId: string | null
}) {
  const { residentId, input, userId } = params
  const resident = await getClinicalResident(residentId)
  const values = await resolveMedicationValues({ locationId: resident.locId, input, label: 'medication' })

  const row = await ResidentMedication.create({
    residentId,
    locationId: resident.locId,
    ...values,
    isActive: true,
    isDeleted: false,
    createdBy: userId,
    updatedBy: userId,
  })
  return formatMedicationRow(row)
}

export async function updateResidentMedication(params: {
  residentId: string
  id: string
  input: UpdateResidentMedicationInput
  userId: string | null
}) {
  const { residentId, id, input, userId } = params
  const row = await findResidentMedication(residentId, id)
  const values = await resolveMedicationValues({
    locationId: row.locationId,
    input,
    existing: medicationValuesOf(row),
    label: 'medication',
  })

  await sequelize.transaction(async (transaction) => {
    await row.update({ ...values, updatedBy: userId }, { transaction })
    if (row.appointmentId) {
      await patchConsultantEntry({
        appointmentId: row.appointmentId,
        field: 'medications',
        id: row.id,
        entry: toConsultantMedicationEntry(row.id, values),
        userId,
        transaction,
      })
    }
  })
  return formatMedicationRow(row)
}

export async function deleteResidentMedication(params: { residentId: string; id: string; userId: string | null }) {
  const { residentId, id, userId } = params
  const row = await findResidentMedication(residentId, id)

  await sequelize.transaction(async (transaction) => {
    await row.update({ isDeleted: true, isActive: false, updatedBy: userId }, { transaction })
    if (row.appointmentId) {
      await patchConsultantEntry({
        appointmentId: row.appointmentId,
        field: 'medications',
        id: row.id,
        entry: null,
        userId,
        transaction,
      })
    }
  })
}
