import { z } from 'zod'
import { listMedicationTasksQuerySchema } from './medicationTask.validation.js'

export const listNurseTasksQuerySchema = listMedicationTasksQuerySchema.extend({
  /** DAY limits completed care tasks to those completed on targetDate (default: all-time). */
  dateScope: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.enum(['DAY']))
    .optional(),
})

export type ListNurseTasksQuery = z.infer<typeof listNurseTasksQuerySchema>
