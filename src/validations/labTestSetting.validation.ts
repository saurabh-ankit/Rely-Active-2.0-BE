import { z } from 'zod'

const nameSchema = z
  .string({ message: 'Name is required' })
  .trim()
  .min(2, 'Name must be between 2 and 100 characters')
  .max(100, 'Name must be between 2 and 100 characters')
  .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Name can only contain letters, numbers, spaces, hyphens, and underscores')

const descriptionSchema = z
  .string({ message: 'Description is required' })
  .trim()
  .min(1, 'Description is required')
  .max(2000, 'Description must not exceed 2000 characters')

const instructionsSchema = z
  .string()
  .trim()
  .max(5000, 'Instructions must not exceed 5000 characters')
  .optional()
  .nullable()
  .or(z.literal('').transform(() => null))

const imageUrlSchema = z
  .string()
  .trim()
  .max(500, 'Image URL is too long')
  .optional()
  .nullable()
  .or(z.literal('').transform(() => null))

export const labTestSettingIdParamSchema = z.object({
  id: z.string().uuid('Valid lab test setting ID is required'),
})

export const createLabTestSettingSchema = z.object({
  name: nameSchema,
  description: descriptionSchema,
  instructions: instructionsSchema,
  imageUrl: imageUrlSchema,
  isActive: z.coerce.boolean().optional(),
})

export const updateLabTestSettingSchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.optional(),
    instructions: instructionsSchema,
    imageUrl: imageUrlSchema,
    isActive: z.coerce.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  })

export type CreateLabTestSettingInput = z.infer<typeof createLabTestSettingSchema>
export type UpdateLabTestSettingInput = z.infer<typeof updateLabTestSettingSchema>
