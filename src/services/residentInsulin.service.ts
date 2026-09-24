import type { Transaction } from 'sequelize'
import { ResidentInsulin } from '../models/index.js'
import type { ConsultantInsulinEntry } from '../models/consultant.model.js'

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
