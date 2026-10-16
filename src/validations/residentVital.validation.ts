import { z } from 'zod'

const valueSchema = z
  .union([z.string(), z.number()], { message: 'Value is required' })
  .transform((val) => String(val).trim())
  .pipe(z.string().min(1, 'Value is required').max(100, 'Value must be 100 characters or fewer'))

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

export const createResidentVitalSchema = z.object({
  vitalSettingId: z.string().uuid('Valid vital type is required'),
  value: valueSchema,
  note: noteSchema,
  recordedAt: recordedAtSchema,
})

export const updateResidentVitalSchema = z
  .object({
    vitalSettingId: z.string().uuid('Valid vital type is required').optional(),
    value: valueSchema.optional(),
    note: noteSchema,
    recordedAt: recordedAtSchema,
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  })

export type CreateResidentVitalInput = z.infer<typeof createResidentVitalSchema>
export type UpdateResidentVitalInput = z.infer<typeof updateResidentVitalSchema>
