import { z } from 'zod'
import { IncidentSeverity, IncidentType } from '../enums/incident.enum.js'

/** Allowance for device clock drift when rejecting future incident times. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000

const notesSchema = z
  .string()
  .trim()
  .max(5000, 'Notes must be 5000 characters or fewer')
  .optional()
  .nullable()
  .or(z.literal('').transform(() => null))

export const createResidentIncidentSchema = z.object({
  incidentType: z.enum(IncidentType, {
    message: `Incident type must be one of ${Object.values(IncidentType).join(', ')}`,
  }),
  severity: z.enum(IncidentSeverity, {
    message: `Severity must be one of ${Object.values(IncidentSeverity).join(', ')}`,
  }),
  incidentAt: z
    .string({ message: 'Incident date and time is required' })
    .trim()
    .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Incident date and time must be a valid date')
    .refine(
      (value) => new Date(value).getTime() <= Date.now() + FUTURE_TOLERANCE_MS,
      'Incident time cannot be in the future',
    ),
  notes: notesSchema,
})

export type CreateResidentIncidentInput = z.infer<typeof createResidentIncidentSchema>

export const updateResidentIncidentSchema = z
  .object({
    incidentType: z
      .enum(IncidentType, {
        message: `Incident type must be one of ${Object.values(IncidentType).join(', ')}`,
      })
      .optional(),
    severity: z
      .enum(IncidentSeverity, {
        message: `Severity must be one of ${Object.values(IncidentSeverity).join(', ')}`,
      })
      .optional(),
    incidentAt: z
      .string()
      .trim()
      .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Incident date and time must be a valid date')
      .refine(
        (value) => new Date(value).getTime() <= Date.now() + FUTURE_TOLERANCE_MS,
        'Incident time cannot be in the future',
      )
      .optional(),
    notes: notesSchema,
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  })

export type UpdateResidentIncidentInput = z.infer<typeof updateResidentIncidentSchema>

export const incidentSopParamsSchema = z.object({
  residentId: z.string().uuid('Valid resident is required'),
  incidentId: z.string().uuid('Valid incident is required'),
  stepId: z.string().uuid('Valid SOP step is required').optional(),
})

export const updateIncidentSopStepSchema = z
  .object({
    isCompleted: z.boolean({ message: 'isCompleted must be true or false' }).optional(),
    note: z
      .string()
      .trim()
      .max(2000, 'Note must be 2000 characters or fewer')
      .nullable()
      .optional()
      .transform((value) => (value === '' ? null : value)),
  })
  .refine((data) => data.isCompleted !== undefined || data.note !== undefined, {
    message: 'Provide isCompleted or note',
  })

export type UpdateIncidentSopStepInput = z.infer<typeof updateIncidentSopStepSchema>
