import { z } from 'zod'

const nameSchema = z
  .string({ message: 'Amenity name is required' })
  .trim()
  .min(2, 'Amenity name must be at least 2 characters')
  .max(150, 'Amenity name must be 150 characters or fewer')

const descriptionSchema = z
  .string()
  .trim()
  .max(500, 'Description must be 500 characters or fewer')
  .optional()
  .or(z.literal('').transform(() => undefined))

const TIME_24_HOUR_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

const parseTimeToMinutes = (value: string): number => {
  const [hours = 0, minutes = 0] = value.split(':').map((part) => Number(part))
  return hours * 60 + minutes
}

const readSettingString = (settings: Record<string, unknown>, key: string): string | undefined => {
  const raw = settings[key]
  if (typeof raw !== 'string') return undefined
  const cleaned = raw.trim()
  return cleaned || undefined
}

export const amenityIdParamSchema = z.object({
  id: z.string().uuid('Valid amenity ID is required'),
})

export const propertyIdParamSchema = z.object({
  propertyId: z.string().uuid('Valid property ID is required'),
})

export const propertyIdByIdParamSchema = z.object({
  id: z.string().uuid('Valid property ID is required'),
})

export const createAmenitySchema = z.object({
  name: nameSchema,
  description: descriptionSchema,
  isActive: z.coerce.boolean().optional(),
})

export const updateAmenitySchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema,
    isActive: z.coerce.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  })

export const updateAmenityStatusSchema = z.object({
  isActive: z.coerce.boolean({ message: 'isActive must be true or false' }),
})

export const propertyAmenitySelectionSchema = z
  .object({
    amenityId: z.string().uuid('Valid amenityId is required'),
    slotBookable: z.coerce.boolean().optional(),
    settings: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .superRefine((item, ctx) => {
    if (!item.settings || typeof item.settings !== 'object' || Array.isArray(item.settings)) return

    const settings = item.settings as Record<string, unknown>
    const availableFrom = readSettingString(settings, 'availableFrom')
    const availableTo = readSettingString(settings, 'availableTo')

    if (availableFrom && !TIME_24_HOUR_REGEX.test(availableFrom)) {
      ctx.addIssue({
        code: 'custom',
        path: ['settings', 'availableFrom'],
        message: 'availableFrom must be in HH:mm format',
      })
    }

    if (availableTo && !TIME_24_HOUR_REGEX.test(availableTo)) {
      ctx.addIssue({
        code: 'custom',
        path: ['settings', 'availableTo'],
        message: 'availableTo must be in HH:mm format',
      })
    }

    if (Boolean(availableFrom) !== Boolean(availableTo)) {
      ctx.addIssue({
        code: 'custom',
        path: ['settings'],
        message: 'Provide both availableFrom and availableTo, or leave both empty',
      })
    }

    if (
      availableFrom &&
      availableTo &&
      TIME_24_HOUR_REGEX.test(availableFrom) &&
      TIME_24_HOUR_REGEX.test(availableTo) &&
      parseTimeToMinutes(availableFrom) >= parseTimeToMinutes(availableTo)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['settings', 'availableTo'],
        message: 'availableTo must be later than availableFrom',
      })
    }

    const duration = settings.slotDurationMinutes
    if (duration !== undefined && duration !== null) {
      const normalizedDuration = Number(duration)
      if (!Number.isInteger(normalizedDuration) || normalizedDuration < 5 || normalizedDuration > 240) {
        ctx.addIssue({
          code: 'custom',
          path: ['settings', 'slotDurationMinutes'],
          message: 'slotDurationMinutes must be an integer between 5 and 240',
        })
      }
    }
  })

export const setPropertyAmenitiesSchema = z.object({
  amenities: z.array(propertyAmenitySelectionSchema).superRefine((items, ctx) => {
    const seen = new Set<string>()
    for (const [index, item] of items.entries()) {
      const key = item.amenityId
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'amenityId'],
          message: 'Each amenity can be selected only once',
        })
      }
      seen.add(key)
    }
  }),
})

export type CreateAmenityInput = z.infer<typeof createAmenitySchema>
export type UpdateAmenityInput = z.infer<typeof updateAmenitySchema>
export type SetPropertyAmenitiesInput = z.infer<typeof setPropertyAmenitiesSchema>
