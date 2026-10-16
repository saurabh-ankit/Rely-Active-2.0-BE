import { z } from 'zod'

const PHONE_REGEX = /^[6-9][0-9]{9}$/

const phoneSchema = (label: string) =>
  z
    .string({ message: `${label} is required` })
    .trim()
    .transform((value) => value.replace(/[\s-]/g, ''))
    .refine((value) => PHONE_REGEX.test(value), `${label} must be a 10-digit number starting with 6, 7, 8, or 9`)

const optionalText = (label: string, max: number) =>
  z
    .union([
      z.literal('').transform(() => null),
      z.string().trim().max(max, `${label} must be ${max} characters or fewer`),
      z.null(),
    ])
    .optional()

const fullNameSchema = z
  .string({ message: 'Full name is required' })
  .trim()
  .min(1, 'Full name is required')
  .max(150, 'Full name must be 150 characters or fewer')

const alternatePhoneSchema = z
  .union([z.literal('').transform(() => null), phoneSchema('Alternate phone'), z.null()])
  .optional()

const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/

const emailSchema = z
  .preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z
      .string()
      .trim()
      .max(255, 'Email must be 255 characters or fewer')
      .regex(EMAIL_REGEX, 'Enter a valid email address')
      .transform((value) => value.toLowerCase())
      .nullable(),
  )
  .optional()

export const createResidentNokContactSchema = z.object({
  fullName: fullNameSchema,
  relationship: optionalText('Relationship', 50),
  phone: phoneSchema('Phone'),
  alternatePhone: alternatePhoneSchema,
  email: emailSchema,
  address: optionalText('Address', 2000),
})

export const updateResidentNokContactSchema = createResidentNokContactSchema.partial().extend({
  removePhoto: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((val) => val === true || val === 'true')
    .optional(),
})

export type CreateResidentNokContactInput = z.infer<typeof createResidentNokContactSchema>
export type UpdateResidentNokContactInput = z.infer<typeof updateResidentNokContactSchema>
