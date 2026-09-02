import { z } from 'zod'

const eventTypeSchema = z.enum(['regular', 'special'])
const frequencyTypeSchema = z.enum(['once', 'daily', 'weekly', 'monthly', 'yearly', 'custom'])

const optionalPositiveInt = z.union([z.number(), z.string()]).transform((val) => {
  if (val === undefined || val === null || val === '') return null
  const parsed = parseInt(String(val), 10)
  return Number.isNaN(parsed) ? null : parsed
})

const parseRecurrenceDaysOfWeek = (raw: unknown): number[] => {
  if (raw === undefined || raw === null || raw === '') return []
  if (Array.isArray(raw)) {
    return raw.map((d) => parseInt(String(d), 10)).filter((d) => !Number.isNaN(d) && d >= 0 && d <= 6)
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map((d) => parseInt(String(d), 10)).filter((d) => !Number.isNaN(d) && d >= 0 && d <= 6)
      }
    } catch {
      return trimmed
        .split(',')
        .map((d) => parseInt(d.trim(), 10))
        .filter((d) => !Number.isNaN(d) && d >= 0 && d <= 6)
    }
  }
  return []
}

const baseEventSchema = z
  .object({
    eventType: eventTypeSchema.optional().default('special'),
    title: z.string().trim().min(1, 'title is required'),
    description: z.string().trim().min(1, 'description is required'),
    venueId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    allowReservation: z.union([z.boolean(), z.string()]).optional(),
    frequencyType: frequencyTypeSchema.optional().default('once'),
    maxCapacity: optionalPositiveInt.optional(),
    reservationPerFlat: optionalPositiveInt.optional(),
    recurrenceDaysOfWeek: z.any().optional(),
    recurrenceDayOfMonth: optionalPositiveInt.optional(),
    recurrenceMonth: optionalPositiveInt.optional(),
    recurrenceDayOfWeek: optionalPositiveInt.optional(),
    entryFee: z.union([z.number(), z.string()]).optional().nullable(),
    selectedServices: z.any().optional(),
    eventOccurrences: z.any().optional(),
  })
  .passthrough()

const validateEventRules = (data: z.infer<typeof baseEventSchema>, ctx: z.RefinementCtx) => {
  const eventType = data.eventType || 'special'
  const frequencyType = data.frequencyType || 'once'
  const allowReservation = data.allowReservation === true || data.allowReservation === 'true'
  const recurrenceDaysOfWeek = parseRecurrenceDaysOfWeek(data.recurrenceDaysOfWeek)

  if (eventType === 'special' && frequencyType !== 'once') {
    ctx.addIssue({
      code: 'custom',
      message: 'Special events must have frequency type "once"',
      path: ['frequencyType'],
    })
  }

  if (eventType === 'regular' && frequencyType === 'once') {
    ctx.addIssue({
      code: 'custom',
      message: 'Regular events cannot have frequency type "once"',
      path: ['frequencyType'],
    })
  }

  if (frequencyType === 'weekly' && recurrenceDaysOfWeek.length === 0) {
    ctx.addIssue({
      code: 'custom',
      message: 'At least one day is required for weekly events',
      path: ['recurrenceDaysOfWeek'],
    })
  }

  if (frequencyType === 'monthly' && !data.recurrenceDayOfMonth) {
    ctx.addIssue({
      code: 'custom',
      message: 'recurrenceDayOfMonth is required for monthly events',
      path: ['recurrenceDayOfMonth'],
    })
  }

  if (frequencyType === 'yearly' && (!data.recurrenceMonth || !data.recurrenceDayOfMonth)) {
    ctx.addIssue({
      code: 'custom',
      message: 'recurrenceMonth and recurrenceDayOfMonth are required for yearly events',
      path: ['recurrenceMonth'],
    })
  }

  if (allowReservation) {
    if (!data.maxCapacity || data.maxCapacity <= 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'maxCapacity is required and must be greater than 0 when allowReservation is enabled',
        path: ['maxCapacity'],
      })
    }
    if (data.reservationPerFlat !== null && data.reservationPerFlat !== undefined && data.reservationPerFlat <= 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'reservationPerFlat must be a positive integer',
        path: ['reservationPerFlat'],
      })
    }
  }
}

export const createEventSchema = baseEventSchema.superRefine(validateEventRules)
export const updateEventSchema = baseEventSchema.superRefine(validateEventRules)
