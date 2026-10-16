import type { Transaction } from 'sequelize'
import { Consultant } from '../models/index.js'
import type {
  ConsultantAllergyEntry,
  ConsultantInsulinEntry,
  ConsultantMedicationEntry,
  ConsultantVitalEntry,
} from '../models/consultant.model.js'

interface ConsultantEntryMap {
  allergies: ConsultantAllergyEntry
  vitals: ConsultantVitalEntry
  medications: ConsultantMedicationEntry
  insulin: ConsultantInsulinEntry
}

export type ConsultantEntryField = keyof ConsultantEntryMap

/**
 * Mirror a web edit/delete of a clinical row into the appointment's consultant JSON.
 * The sync services re-apply consultant JSON on every diagnosis save, so without this
 * a draft save from the doctor app would revert the change.
 * Pass `entry: null` to remove the entry.
 */
export async function patchConsultantEntry<F extends ConsultantEntryField>(params: {
  appointmentId: string
  field: F
  id: string
  entry: ConsultantEntryMap[F] | null
  userId?: string | null
  transaction?: Transaction
}): Promise<void> {
  const { appointmentId, field, id, entry, userId, transaction } = params

  const row = await Consultant.findOne({
    where: { appointmentId, isDeleted: false },
    ...(transaction ? { transaction } : {}),
  })
  if (!row) return

  const current = (Array.isArray(row[field]) ? row[field] : []) as ConsultantEntryMap[F][]
  const index = current.findIndex((item) => item.id === id)
  if (index === -1 && !entry) return

  const next =
    entry === null
      ? current.filter((item) => item.id !== id)
      : index === -1
        ? [...current, entry]
        : current.map((item) => (item.id === id ? entry : item))

  ;(row as unknown as Record<F, ConsultantEntryMap[F][]>)[field] = next
  row.changed(field, true)
  row.updatedBy = userId || null
  await row.save(transaction ? { transaction } : undefined)
}
