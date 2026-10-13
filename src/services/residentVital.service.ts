import type { Transaction } from 'sequelize'
import sequelize from '../config/db/index.js'
import { HttpError } from '../middlewares/error/http-error.js'
import { ResidentVital, VitalSetting } from '../models/index.js'
import type { ConsultantVitalEntry } from '../models/consultant.model.js'
import type { CreateResidentVitalInput, UpdateResidentVitalInput } from '../validations/residentVital.validation.js'
import { patchConsultantEntry } from './consultantEntry.service.js'
import { formatVitalRow, getClinicalResident } from './residentClinical.service.js'

/**
 * Keep resident_vitals in sync with consultant.vitals JSON for an appointment.
 * Uses the same entry ids so charts and diagnosis share stable vital ids.
 */
export async function syncAppointmentVitals(params: {
  residentId: string
  locationId: string
  appointmentId: string
  vitals: ConsultantVitalEntry[]
  userId?: string | null
  transaction?: Transaction
}): Promise<void> {
  const { residentId, locationId, appointmentId, vitals, userId, transaction } = params
  const keepIds = new Set(vitals.map((v) => v.id))

  const existing = await ResidentVital.findAll({
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

  for (const vital of vitals) {
    const recordedAt = new Date(vital.recordedAt)
    const payload = {
      residentId,
      locationId,
      appointmentId,
      vitalSettingId: vital.vitalSettingId || null,
      name: vital.name,
      unit: vital.unit || null,
      value: vital.value || null,
      note: vital.note || null,
      recordedAt: Number.isNaN(recordedAt.getTime()) ? new Date() : recordedAt,
      isActive: true,
      isDeleted: false,
      updatedBy: userId || null,
    }

    const found = await ResidentVital.findOne({
      where: { id: vital.id },
      ...(transaction ? { transaction } : {}),
    })

    if (found) {
      Object.assign(found, payload)
      await found.save(transaction ? { transaction } : undefined)
    } else {
      await ResidentVital.create(
        {
          id: vital.id,
          ...payload,
          createdBy: userId || null,
        },
        transaction ? { transaction } : undefined,
      )
    }
  }
}

interface VitalValues {
  vitalSettingId: string | null
  name: string
  unit: string | null
  value: string
  note: string | null
  recordedAt: Date
}

/**
 * Same value rules as the doctor diagnosis: numeric for single inputs, `120/80` style for composite ones.
 */
function assertVitalValue(setting: VitalSetting, value: string): void {
  if (setting.inputType === 'single') {
    if (!Number.isFinite(Number(value))) {
      throw new HttpError(400, `Enter a valid numeric value for ${setting.name}`)
    }
    return
  }
  const compositeOk = /^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/.test(value)
  if (!compositeOk && !Number.isFinite(Number(value))) {
    throw new HttpError(400, `Enter a valid value for ${setting.name} (e.g. 120/80)`)
  }
}

async function resolveVitalValues(
  input: CreateResidentVitalInput | UpdateResidentVitalInput,
  existing?: ResidentVital,
): Promise<VitalValues> {
  const vitalSettingId = input.vitalSettingId ?? existing?.vitalSettingId
  if (!vitalSettingId) {
    throw new HttpError(400, 'Vital type is required')
  }
  const value = input.value ?? existing?.value
  if (!value) {
    throw new HttpError(400, 'Value is required')
  }

  const setting = await VitalSetting.findOne({
    where: {
      id: vitalSettingId,
      isDeleted: false,
      ...(vitalSettingId !== existing?.vitalSettingId ? { isActive: true } : {}),
    },
  })
  if (!setting) {
    throw new HttpError(400, 'Vital type not found or inactive')
  }
  assertVitalValue(setting, value)

  const recordedAt = input.recordedAt ? new Date(input.recordedAt) : (existing?.recordedAt ?? new Date())

  return {
    vitalSettingId: setting.id,
    name: setting.name,
    unit: setting.unit || null,
    value,
    note: input.note !== undefined ? input.note?.trim() || null : (existing?.note ?? null),
    recordedAt,
  }
}

function toConsultantVitalEntry(id: string, values: VitalValues): ConsultantVitalEntry {
  return {
    id,
    vitalSettingId: values.vitalSettingId || '',
    name: values.name,
    unit: values.unit || '',
    value: values.value,
    note: values.note,
    recordedAt: values.recordedAt.toISOString(),
  }
}

async function findResidentVital(residentId: string, id: string): Promise<ResidentVital> {
  const row = await ResidentVital.findOne({ where: { id, residentId, isDeleted: false } })
  if (!row) {
    throw new HttpError(404, 'Vital not found')
  }
  return row
}

export async function createResidentVital(params: {
  residentId: string
  input: CreateResidentVitalInput
  userId: string | null
}) {
  const { residentId, input, userId } = params
  const resident = await getClinicalResident(residentId)
  const values = await resolveVitalValues(input)

  const row = await ResidentVital.create({
    residentId,
    locationId: resident.locId,
    ...values,
    isActive: true,
    isDeleted: false,
    createdBy: userId,
    updatedBy: userId,
  })
  return formatVitalRow(row)
}

export async function updateResidentVital(params: {
  residentId: string
  id: string
  input: UpdateResidentVitalInput
  userId: string | null
}) {
  const { residentId, id, input, userId } = params
  const row = await findResidentVital(residentId, id)
  const values = await resolveVitalValues(input, row)

  await sequelize.transaction(async (transaction) => {
    await row.update({ ...values, updatedBy: userId }, { transaction })
    if (row.appointmentId) {
      await patchConsultantEntry({
        appointmentId: row.appointmentId,
        field: 'vitals',
        id: row.id,
        entry: toConsultantVitalEntry(row.id, values),
        userId,
        transaction,
      })
    }
  })
  return formatVitalRow(row)
}

export async function deleteResidentVital(params: { residentId: string; id: string; userId: string | null }) {
  const { residentId, id, userId } = params
  const row = await findResidentVital(residentId, id)

  await sequelize.transaction(async (transaction) => {
    await row.update({ isDeleted: true, isActive: false, updatedBy: userId }, { transaction })
    if (row.appointmentId) {
      await patchConsultantEntry({
        appointmentId: row.appointmentId,
        field: 'vitals',
        id: row.id,
        entry: null,
        userId,
        transaction,
      })
    }
  })
}
