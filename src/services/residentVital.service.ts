import type { Transaction } from 'sequelize'
import { ResidentVital } from '../models/index.js'
import type { ConsultantVitalEntry } from '../models/consultant.model.js'

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
