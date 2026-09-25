import { z } from 'zod'
import { VITAL_INPUT_TYPES } from '../models/vitalSetting.model.js'

const optionalNullableNumber = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((val): number | null => {
    if (val === null || val === undefined || val === '') return null
    const n = typeof val === 'number' ? val : Number(val)
    return Number.isFinite(n) ? n : null
  })

const nameSchema = z
  .string({ message: 'Name is required' })
  .trim()
  .min(2, 'Name must be between 2 and 100 characters')
  .max(100, 'Name must be between 2 and 100 characters')
  .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Name can only contain letters, numbers, spaces, hyphens, and underscores')

const unitSchema = z
  .string({ message: 'Unit is required' })
  .trim()
  .min(1, 'Unit must be between 1 and 20 characters')
  .max(20, 'Unit must be between 1 and 20 characters')

const descriptionSchema = z
  .string()
  .trim()
  .max(500, 'Description must not exceed 500 characters')
  .optional()
  .nullable()
  .or(z.literal('').transform(() => null))

const imageUrlSchema = z
  .string({ message: 'Image URL is required' })
  .trim()
  .min(1, 'Image URL is required')
  .max(500, 'Image URL is too long')

const inputTypeSchema = z.enum(VITAL_INPUT_TYPES, {
  message: 'Input type must be single or composite',
})

const thresholdFieldsSchema = {
  lowRiskyBelow: optionalNullableNumber.optional(),
  lowBelow: optionalNullableNumber.optional(),
  normalMin: optionalNullableNumber.optional(),
  normalMax: optionalNullableNumber.optional(),
  highAbove: optionalNullableNumber.optional(),
  highRiskyAbove: optionalNullableNumber.optional(),
}

export const vitalSettingIdParamSchema = z.object({
  id: z.string().uuid('Valid vital setting ID is required'),
})

export const createVitalSettingSchema = z.object({
  name: nameSchema,
  code: z
    .string()
    .trim()
    .max(50)
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
  description: descriptionSchema,
  imageUrl: imageUrlSchema.optional(),
  unit: unitSchema,
  inputType: inputTypeSchema,
  ...thresholdFieldsSchema,
  isActive: z.coerce.boolean().optional(),
})

export const updateVitalSettingSchema = z
  .object({
    name: nameSchema.optional(),
    code: z
      .string()
      .trim()
      .max(50)
      .optional()
      .nullable()
      .or(z.literal('').transform(() => null)),
    description: descriptionSchema,
    imageUrl: imageUrlSchema.optional(),
    unit: unitSchema.optional(),
    inputType: inputTypeSchema.optional(),
    ...thresholdFieldsSchema,
    isActive: z.coerce.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  })

export type CreateVitalSettingInput = z.infer<typeof createVitalSettingSchema>
export type UpdateVitalSettingInput = z.infer<typeof updateVitalSettingSchema>
