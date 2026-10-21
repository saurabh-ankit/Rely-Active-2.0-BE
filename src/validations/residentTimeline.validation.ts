import { z } from 'zod'

export const RESIDENT_TIMELINE_EVENT_TYPES = [
  'allergy',
  'vital',
  'medication',
  'insulin',
  'lab',
  'appointment',
  'care_task',
  'condition',
  'incident',
  'fluid_balance',
] as const

const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .optional()
  .or(z.literal('').transform(() => undefined))

/** Comma-separated list, e.g. `types=medication,insulin`. */
const eventTypeList = z
  .string()
  .trim()
  .optional()
  .transform((raw) => {
    const parts = (raw || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    return parts.length ? parts : undefined
  })
  .pipe(z.array(z.enum(RESIDENT_TIMELINE_EVENT_TYPES, { message: 'Invalid timeline event type' })).optional())

export const residentTimelineQuerySchema = z
  .object({
    startDate: optionalDate,
    endDate: optionalDate,
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    type: z
      .enum(RESIDENT_TIMELINE_EVENT_TYPES, { message: 'Invalid timeline event type' })
      .optional()
      .or(z.literal('').transform(() => undefined)),
    types: eventTypeList,
  })
  .refine((q) => !q.startDate || !q.endDate || q.startDate <= q.endDate, {
    message: 'startDate must be on or before endDate',
    path: ['startDate'],
  })

export type ResidentTimelineQuery = z.infer<typeof residentTimelineQuerySchema>
