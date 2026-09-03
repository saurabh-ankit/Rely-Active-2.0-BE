import { z } from 'zod'

// ── Shared Helpers ────────────────────────────────────────────────────────────
const optionalPositiveInt = z.union([z.number(), z.string()]).transform((val) => {
  if (val === undefined || val === null || val === '') return null
  const parsed = parseInt(String(val), 10)
  return Number.isNaN(parsed) ? null : parsed
})

const positiveInt = z.union([z.number(), z.string()]).transform((val) => {
  if (val === undefined || val === null || val === '') return null
  const parsed = parseInt(String(val), 10)
  return Number.isNaN(parsed) ? null : parsed
})

const nonNegativeNumber = z.union([z.number(), z.string()]).transform((val) => {
  if (val === undefined || val === null || val === '') return 0
  const parsed = Number(val)
  return Number.isNaN(parsed) ? 0 : parsed
})

const eventTypeSchema = z.enum(['regular', 'special'])
const frequencyTypeSchema = z.enum(['once', 'daily', 'weekly', 'monthly', 'yearly', 'custom'])

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

// ── Event Validation Schemas ──────────────────────────────────────────────────
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

// ── Venue Validation Schemas ──────────────────────────────────────────────────
export const addOnServiceItemSchema = z.object({
  name: z.string().trim().min(1, 'Each add-on service must have a name'),
  quantity: positiveInt.refine((val) => val !== null && val >= 1, {
    message: 'Quantity must be at least 1',
  }),
  globalServiceId: z.string().optional(),
  price: nonNegativeNumber.optional(),
  imageUrl: z.string().optional(),
  keyFeatures: z.string().optional(),
})

export const createVenueSchema = z
  .object({
    name: z.string().trim().min(1, 'Venue name is required'),
    occupancy: positiveInt.refine((val) => val !== null && val > 0, {
      message: 'Occupancy must be greater than 0',
    }),
    price: nonNegativeNumber.optional(),
    keyFeatures: z.string().trim().min(1, 'Key features are required'),
    otherServices: z.string().optional().nullable(),
    images: z.any().optional(),
    addOnServices: z.any().optional(),
  })
  .passthrough()

export const updateVenueSchema = createVenueSchema.partial().passthrough()

// ── Global Service Validation Schemas ─────────────────────────────────────────
export const propertyAssignmentSchema = z.object({
  locId: z.string().min(1),
  price: nonNegativeNumber.optional(),
  quantity: positiveInt.refine((val) => val !== null && val >= 1, {
    message: 'Quantity must be at least 1 for each assigned property',
  }),
})

export const createGlobalServiceSchema = z
  .object({
    name: z.string().trim().min(1, 'Service name is required'),
    description: z.string().optional().nullable(),
    basePrice: nonNegativeNumber.optional(),
    imageUrl: z.string().optional().nullable(),
    isActive: z.union([z.boolean(), z.string()]).optional(),
    propertyAssignments: z.any().optional(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    if (
      data.propertyAssignments === undefined ||
      data.propertyAssignments === null ||
      data.propertyAssignments === ''
    ) {
      return
    }

    let assignments: unknown[] = []
    if (Array.isArray(data.propertyAssignments)) {
      assignments = data.propertyAssignments
    } else if (typeof data.propertyAssignments === 'string') {
      try {
        const parsed = JSON.parse(data.propertyAssignments)
        assignments = Array.isArray(parsed) ? parsed : []
      } catch {
        ctx.addIssue({
          code: 'custom',
          message: 'propertyAssignments must be a valid JSON array',
          path: ['propertyAssignments'],
        })
        return
      }
    }

    for (const item of assignments) {
      const result = propertyAssignmentSchema.safeParse(item)
      if (!result.success) {
        const message = result.error.issues[0]?.message || 'Invalid property assignment'
        ctx.addIssue({
          code: 'custom',
          message,
          path: ['propertyAssignments'],
        })
        return
      }
    }
  })

export const updateGlobalServiceSchema = createGlobalServiceSchema
