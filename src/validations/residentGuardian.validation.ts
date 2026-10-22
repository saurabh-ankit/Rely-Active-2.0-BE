import { z } from 'zod'

const PHONE_REGEX = /^[6-9][0-9]{9}$/
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/
const USERNAME_REGEX = /^[A-Za-z0-9._@-]{3,50}$/

const optionalText = (label: string, max: number) =>
  z
    .union([
      z.literal('').transform(() => null),
      z.string().trim().max(max, `${label} must be ${max} characters or fewer`),
      z.null(),
    ])
    .optional()

const phoneSchema = z
  .string({ message: 'Phone is required' })
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .refine((value) => PHONE_REGEX.test(value), 'Phone must be a 10-digit number starting with 6, 7, 8, or 9')

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

const passwordSchema = z
  .string({ message: 'Password is required' })
  .min(6, 'Password must be at least 6 characters')
  .max(100, 'Password must be 100 characters or fewer')

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((val) => val === true || val === 'true')
  .optional()

export const createResidentGuardianSchema = z.object({
  firstName: z.string({ message: 'First name is required' }).trim().min(1, 'First name is required').max(100),
  lastName: optionalText('Last name', 100),
  relation: z.string({ message: 'Relation is required' }).trim().min(1, 'Relation is required').max(50),
  gender: z.union([z.enum(['MALE', 'FEMALE', 'OTHER']), z.literal('').transform(() => null), z.null()]).optional(),
  phone: phoneSchema,
  email: emailSchema,
  address: optionalText('Address', 2000),
  username: z
    .string({ message: 'Username is required' })
    .trim()
    .regex(USERNAME_REGEX, 'Username must be 3–50 letters, numbers or . _ @ -'),
  password: passwordSchema,
})

/** Every field optional except `password`, which must be re-entered on every update; `removePhoto` clears the photo. */
export const updateResidentGuardianSchema = createResidentGuardianSchema.partial().extend({
  password: passwordSchema,
  isActive: booleanish,
  removePhoto: booleanish,
})

export type CreateResidentGuardianInput = z.infer<typeof createResidentGuardianSchema>
export type UpdateResidentGuardianInput = z.infer<typeof updateResidentGuardianSchema>
