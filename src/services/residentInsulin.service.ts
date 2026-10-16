import type { Transaction } from 'sequelize'
import sequelize from '../config/db/index.js'
import { HttpError } from '../middlewares/error/http-error.js'
import { ResidentInsulin } from '../models/index.js'
import type { ConsultantInsulinEntry } from '../models/consultant.model.js'
import type {
  CreateResidentMedicationInput,
  UpdateResidentMedicationInput,
} from '../validations/residentMedication.validation.js'
import { patchConsultantEntry } from './consultantEntry.service.js'
import { formatMedicationRow, getClinicalResident } from './residentClinical.service.js'
import {
  type MedicationValues,
  resolveMedicationValues,
  toConsultantMedicationEntry,
} from './residentMedication.service.js'

const INSULIN_PACK_TYPE = 'vial'

/**
 * Keep resident_insulin in sync with consultant.insulin JSON for an appointment.
 * Uses the same entry ids so charts and diagnosis share stable insulin ids.
 */
export async function syncAppointmentInsulin(params: {
  residentId: string
  locationId: string
  appointmentId: string
  insulin: ConsultantInsulinEntry[]
  userId?: string | null
  transaction?: Transaction
}): Promise<void> {
  const { residentId, locationId, appointmentId, insulin, userId, transaction } = params
  const keepIds = new Set(insulin.map((m) => m.id))

  const existing = await ResidentInsulin.findAll({
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

  for (const entry of insulin) {
    const payload = {
      residentId,
      locationId,
      appointmentId,
      inventoryItemId: entry.inventoryItemId,
      medicineName: entry.medicineName,
      startDate: entry.startDate,
      endDate: entry.isUntilDischarge ? null : entry.endDate,
      isUntilDischarge: Boolean(entry.isUntilDischarge),
      timings: entry.timings || [],
      note: entry.note || null,
      isActive: true,
      isDeleted: false,
      updatedBy: userId || null,
    }

    const found = await ResidentInsulin.findOne({
      where: { id: entry.id },
      ...(transaction ? { transaction } : {}),
    })

    if (found) {
      Object.assign(found, payload)
      await found.save(transaction ? { transaction } : undefined)
    } else {
      await ResidentInsulin.create(
        {
          id: entry.id,
          ...payload,
          createdBy: userId || null,
        },
        transaction ? { transaction } : undefined,
      )
    }
  }
}

function insulinValuesOf(row: ResidentInsulin): MedicationValues {
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

async function findResidentInsulin(residentId: string, id: string): Promise<ResidentInsulin> {
  const row = await ResidentInsulin.findOne({ where: { id, residentId, isDeleted: false } })
  if (!row) {
    throw new HttpError(404, 'Insulin not found')
  }
  return row
}

export async function createResidentInsulin(params: {
  residentId: string
  input: CreateResidentMedicationInput
  userId: string | null
}) {
  const { residentId, input, userId } = params
  const resident = await getClinicalResident(residentId)
  const values = await resolveMedicationValues({
    locationId: resident.locId,
    input,
    requiredPackType: INSULIN_PACK_TYPE,
    label: 'insulin',
  })

  const row = await ResidentInsulin.create({
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

export async function updateResidentInsulin(params: {
  residentId: string
  id: string
  input: UpdateResidentMedicationInput
  userId: string | null
}) {
  const { residentId, id, input, userId } = params
  const row = await findResidentInsulin(residentId, id)
  const values = await resolveMedicationValues({
    locationId: row.locationId,
    input,
    existing: insulinValuesOf(row),
    requiredPackType: INSULIN_PACK_TYPE,
    label: 'insulin',
  })

  await sequelize.transaction(async (transaction) => {
    await row.update({ ...values, updatedBy: userId }, { transaction })
    if (row.appointmentId) {
      await patchConsultantEntry({
        appointmentId: row.appointmentId,
        field: 'insulin',
        id: row.id,
        entry: toConsultantMedicationEntry(row.id, values),
        userId,
        transaction,
      })
    }
  })
  return formatMedicationRow(row)
}

export async function deleteResidentInsulin(params: { residentId: string; id: string; userId: string | null }) {
  const { residentId, id, userId } = params
  const row = await findResidentInsulin(residentId, id)

  await sequelize.transaction(async (transaction) => {
    await row.update({ isDeleted: true, isActive: false, updatedBy: userId }, { transaction })
    if (row.appointmentId) {
      await patchConsultantEntry({
        appointmentId: row.appointmentId,
        field: 'insulin',
        id: row.id,
        entry: null,
        userId,
        transaction,
      })
    }
  })
}
