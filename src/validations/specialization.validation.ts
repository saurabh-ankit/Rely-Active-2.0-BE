import { z } from 'zod'

/** Codes are stored uppercase with underscores, e.g. `GENERAL_PHYSICIAN`. */
export const normalizeSpecializationCode = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const nameSchema = z
  .string({ message: 'Specialization name is required' })
  .trim()
  .min(2, 'Specialization name must be at least 2 characters')
  .max(150, 'Specialization name must be 150 characters or fewer')

const codeSchema = z
  .string()
  .trim()
  .min(2, 'Code must be at least 2 characters')
  .max(50, 'Code must be 50 characters or fewer')
  .transform(normalizeSpecializationCode)

const descriptionSchema = z
  .string()
  .trim()
  .max(500, 'Description must be 500 characters or fewer')
  .optional()
  .or(z.literal('').transform(() => undefined))

export const specializationIdParamSchema = z.object({
  id: z.string().uuid('Valid specialization ID is required'),
})

export const createSpecializationSchema = z.object({
  name: nameSchema,
  code: codeSchema.optional(),
  description: descriptionSchema,
  isActive: z.coerce.boolean().optional(),
})

export const updateSpecializationSchema = z
  .object({
    name: nameSchema.optional(),
    code: codeSchema.optional(),
    description: descriptionSchema,
    isActive: z.coerce.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  })

export const updateSpecializationStatusSchema = z.object({
  isActive: z.coerce.boolean({ message: 'isActive must be true or false' }),
})

/** Used when assigning specializations to a doctor. */
export const setDoctorSpecializationsSchema = z.object({
  specializationIds: z
    .array(z.string().uuid('Each specialization ID must be a valid UUID'))
    .min(1, 'Select at least one specialization'),
  primarySpecializationId: z.string().uuid('Valid primary specialization ID is required').optional(),
})

export type CreateSpecializationInput = z.infer<typeof createSpecializationSchema>
export type UpdateSpecializationInput = z.infer<typeof updateSpecializationSchema>
export type SetDoctorSpecializationsInput = z.infer<typeof setDoctorSpecializationsSchema>
