import { z } from 'zod'

const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/

export const amenitySlotParamsSchema = z.object({
  locationId: z.string().uuid('Valid locationId is required'),
  amenityId: z.string().uuid('Valid amenityId is required'),
})

export const amenitySlotQuerySchema = z.object({
  date: z.string().regex(YMD_REGEX, 'date must be in YYYY-MM-DD format'),
})

export const updateAmenitySlotConfigSchema = z
  .object({
    openMinutes: z.coerce.number().int().min(0).max(1439),
    closeMinutes: z.coerce.number().int().min(1).max(1440),
    durationMin: z.coerce.number().int().min(5).max(240),
    capacity: z.coerce.number().int().min(1).max(20),
    daysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).min(1, 'Pick at least one open day'),
    force: z.coerce.boolean().optional(),
  })
  .superRefine((payload, ctx) => {
    if (payload.closeMinutes <= payload.openMinutes) {
      ctx.addIssue({
        code: 'custom',
        path: ['closeMinutes'],
        message: 'closeMinutes must be greater than openMinutes',
      })
    }
  })

export const createAmenitySlotBookingSchema = z.object({
  date: z.string().regex(YMD_REGEX, 'date must be in YYYY-MM-DD format'),
  startMinutes: z.coerce.number().int().min(0).max(1439),
  residentId: z.string().uuid('Valid residentId is required'),
  notes: z.string().trim().max(500).optional(),
})

export const createAmenitySlotBlockSchema = z.object({
  date: z.string().regex(YMD_REGEX, 'date must be in YYYY-MM-DD format'),
  startMinutes: z.coerce.number().int().min(0).max(1439),
  reason: z.string().trim().max(500).optional(),
})

export const amenitySlotBookingParamsSchema = amenitySlotParamsSchema.extend({
  bookingId: z.string().uuid('Valid bookingId is required'),
})

export const amenitySlotBlockParamsSchema = amenitySlotParamsSchema.extend({
  blockId: z.string().uuid('Valid blockId is required'),
})
