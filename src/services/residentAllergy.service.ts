import type { Transaction } from 'sequelize'
import sequelize from '../config/db/index.js'
import { HttpError } from '../middlewares/error/http-error.js'
import { ResidentAllergy } from '../models/index.js'
import type { ConsultantAllergyEntry } from '../models/consultant.model.js'
import type {
  CreateResidentAllergyInput,
  UpdateResidentAllergyInput,
} from '../validations/residentAllergy.validation.js'
import { patchConsultantEntry } from './consultantEntry.service.js'
import { formatAllergyRow, getClinicalResident } from './residentClinical.service.js'

/**
 * Keep resident_allergies in sync with consultant.allergies JSON for an appointment.
 */
export async function syncAppointmentAllergies(params: {
  residentId: string
  locationId: string
  appointmentId: string
  allergies: ConsultantAllergyEntry[]
  userId?: string | null
  transaction?: Transaction
}): Promise<void> {
  const { residentId, locationId, appointmentId, allergies, userId, transaction } = params
  const keepIds = new Set(allergies.map((a) => a.id))

  const existing = await ResidentAllergy.findAll({
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

  for (const allergy of allergies) {
    const recordedAt = new Date(allergy.recordedAt)
    const payload = {
      residentId,
      locationId,
      appointmentId,
      name: allergy.name,
      note: allergy.note || null,
      recordedAt: Number.isNaN(recordedAt.getTime()) ? new Date() : recordedAt,
      isActive: true,
      isDeleted: false,
      updatedBy: userId || null,
    }

    const found = await ResidentAllergy.findOne({
      where: { id: allergy.id },
      ...(transaction ? { transaction } : {}),
    })

    if (found) {
      Object.assign(found, payload)
      await found.save(transaction ? { transaction } : undefined)
    } else {
      await ResidentAllergy.create(
        {
          id: allergy.id,
          ...payload,
          createdBy: userId || null,
        },
        transaction ? { transaction } : undefined,
      )
    }
  }
}

function toConsultantAllergyEntry(row: ResidentAllergy): ConsultantAllergyEntry {
  return {
    id: row.id,
    name: row.name,
    note: row.note || null,
    recordedAt: new Date(row.recordedAt).toISOString(),
  }
}

async function findResidentAllergy(residentId: string, id: string): Promise<ResidentAllergy> {
  const row = await ResidentAllergy.findOne({ where: { id, residentId, isDeleted: false } })
  if (!row) {
    throw new HttpError(404, 'Allergy not found')
  }
  return row
}

export async function createResidentAllergy(params: {
  residentId: string
  input: CreateResidentAllergyInput
  userId: string | null
}) {
  const { residentId, input, userId } = params
  const resident = await getClinicalResident(residentId)

  const row = await ResidentAllergy.create({
    residentId,
    locationId: resident.locId,
    name: input.name.trim(),
    note: input.note?.trim() || null,
    recordedAt: input.recordedAt ? new Date(input.recordedAt) : new Date(),
    isActive: true,
    isDeleted: false,
    createdBy: userId,
    updatedBy: userId,
  })
  return formatAllergyRow(row)
}

export async function updateResidentAllergy(params: {
  residentId: string
  id: string
  input: UpdateResidentAllergyInput
  userId: string | null
}) {
  const { residentId, id, input, userId } = params
  const row = await findResidentAllergy(residentId, id)

  await sequelize.transaction(async (transaction) => {
    await row.update(
      {
        name: input.name !== undefined ? input.name.trim() : row.name,
        note: input.note !== undefined ? input.note?.trim() || null : row.note,
        recordedAt: input.recordedAt ? new Date(input.recordedAt) : row.recordedAt,
        updatedBy: userId,
      },
      { transaction },
    )
    if (row.appointmentId) {
      await patchConsultantEntry({
        appointmentId: row.appointmentId,
        field: 'allergies',
        id: row.id,
        entry: toConsultantAllergyEntry(row),
        userId,
        transaction,
      })
    }
  })
  return formatAllergyRow(row)
}

export async function deleteResidentAllergy(params: { residentId: string; id: string; userId: string | null }) {
  const { residentId, id, userId } = params
  const row = await findResidentAllergy(residentId, id)

  await sequelize.transaction(async (transaction) => {
    await row.update({ isDeleted: true, isActive: false, updatedBy: userId }, { transaction })
    if (row.appointmentId) {
      await patchConsultantEntry({
        appointmentId: row.appointmentId,
        field: 'allergies',
        id: row.id,
        entry: null,
        userId,
        transaction,
      })
    }
  })
}
