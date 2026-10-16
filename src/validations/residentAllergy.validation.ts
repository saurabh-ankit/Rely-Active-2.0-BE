import { z } from 'zod'

const nameSchema = z
  .string({ message: 'Allergy name is required' })
  .trim()
  .min(1, 'Allergy name is required')
  .max(200, 'Allergy name must be 200 characters or fewer')

const noteSchema = z
  .string()
  .trim()
  .max(5000, 'Note must be 5000 characters or fewer')
  .optional()
  .nullable()
  .or(z.literal('').transform(() => null))

const recordedAtSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Recorded at must be a valid date')
  .optional()
  .nullable()
  .or(z.literal('').transform(() => null))

export const createResidentAllergySchema = z.object({
  name: nameSchema,
  note: noteSchema,
  recordedAt: recordedAtSchema,
})

export const updateResidentAllergySchema = z
  .object({
    name: nameSchema.optional(),
    note: noteSchema,
    recordedAt: recordedAtSchema,
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  })

export type CreateResidentAllergyInput = z.infer<typeof createResidentAllergySchema>
export type UpdateResidentAllergyInput = z.infer<typeof updateResidentAllergySchema>
