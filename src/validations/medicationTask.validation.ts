import { z } from 'zod'
import { MedicationKind } from '../enums/medication.enum.js'
import { MEDICATION_TIMES_OF_DAY } from './residentMedication.validation.js'

const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()), 'Invalid date')

export const listMedicationTasksQuerySchema = z.object({
  tab: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.enum(['PENDING', 'COMPLETED', 'ALL']))
    .optional(),
  targetDate: dateOnlySchema.optional(),
  search: z.string().trim().max(200).optional(),
  locationId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
})

export const medicationTaskParamsSchema = z.object({
  kind: z.enum(MedicationKind, { message: 'Invalid medication kind' }),
  medicationId: z.string().uuid('Valid medication is required'),
})

export const medicationTaskDetailQuerySchema = z.object({
  targetDate: dateOnlySchema.optional(),
})

export const completeMedicationTaskSchema = z.object({
  kind: z.enum(MedicationKind, { message: 'Invalid medication kind' }),
  medicationId: z.string().uuid('Valid medication is required'),
  timeOfDay: z.enum(MEDICATION_TIMES_OF_DAY, { message: 'Invalid time of day' }),
  scheduledDate: dateOnlySchema,
  notes: z
    .string()
    .trim()
    .max(5000, 'Notes must be 5000 characters or fewer')
    .optional()
    .nullable()
    .transform((value) => value || null),
})

/** Same slot identity as completion; `notes` holds the cancellation reason. */
export const cancelMedicationTaskSchema = completeMedicationTaskSchema

export const listMedicationAdministrationsQuerySchema = z.object({
  date: dateOnlySchema.optional(),
  kind: z.enum(MedicationKind).optional(),
  medicationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

export type ListMedicationTasksQuery = z.infer<typeof listMedicationTasksQuerySchema>
export type MedicationTaskParams = z.infer<typeof medicationTaskParamsSchema>
export type MedicationTaskDetailQuery = z.infer<typeof medicationTaskDetailQuerySchema>
export type CompleteMedicationTaskInput = z.infer<typeof completeMedicationTaskSchema>
export type CancelMedicationTaskInput = z.infer<typeof cancelMedicationTaskSchema>
export type ListMedicationAdministrationsQuery = z.infer<typeof listMedicationAdministrationsQuerySchema>
