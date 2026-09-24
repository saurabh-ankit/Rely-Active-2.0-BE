import type { Transaction } from 'sequelize'
import { ResidentMedication } from '../models/index.js'
import type { ConsultantMedicationEntry } from '../models/consultant.model.js'

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
