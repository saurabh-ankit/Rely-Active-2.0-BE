import type { Transaction } from 'sequelize'
import { ResidentAllergy } from '../models/index.js'
import type { ConsultantAllergyEntry } from '../models/consultant.model.js'

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
