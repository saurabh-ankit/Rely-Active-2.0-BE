import { z } from 'zod'
import { MedicationMealTiming, MedicationRoute } from '../enums/medication.enum.js'

export const MEDICATION_TIMES_OF_DAY = ['morning', 'afternoon', 'evening', 'night'] as const

const dateOnlySchema = z
  .string({ message: 'Date is required' })
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()), 'Invalid date')

const noteSchema = z
  .string()
  .trim()
  .max(5000, 'Note must be 5000 characters or fewer')
  .optional()
  .nullable()
  .or(z.literal('').transform(() => null))

const timingSchema = z.object({
  timeOfDay: z.enum(MEDICATION_TIMES_OF_DAY, { message: 'Invalid time of day' }),
  selected: z.boolean().default(false),
  time: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:mm format')
    .default('08:00'),
  dose: z.coerce.number({ message: 'Dose must be a number' }).min(0, 'Dose cannot be negative'),
  route: z.enum(MedicationRoute, { message: 'Invalid route' }).default(MedicationRoute.ORAL),
  mealTiming: z.enum(MedicationMealTiming, { message: 'Invalid meal timing' }).default(MedicationMealTiming.NONE),
})

const timingsSchema = z
  .array(timingSchema)
  .refine((timings) => timings.some((t) => t.selected), { message: 'Select at least one intake time' })
  .refine((timings) => new Set(timings.map((t) => t.timeOfDay)).size === timings.length, {
    message: 'Each time of day can only be added once',
  })

const endDateSchema = dateOnlySchema
  .optional()
  .nullable()
  .or(z.literal('').transform(() => null))

const medicationFields = {
  inventoryItemId: z.string().uuid('Valid medicine is required'),
  startDate: dateOnlySchema,
  endDate: endDateSchema,
  isUntilDischarge: z.boolean().optional(),
  timings: timingsSchema,
  note: noteSchema,
}

export const createResidentMedicationSchema = z.object(medicationFields).superRefine((data, ctx) => {
  if (data.isUntilDischarge) return
  if (!data.endDate) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date is required when not until discharge' })
    return
  }
  if (data.endDate < data.startDate) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be on or after start date' })
  }
})

export const updateResidentMedicationSchema = z
  .object({
    inventoryItemId: medicationFields.inventoryItemId.optional(),
    startDate: dateOnlySchema.optional(),
    endDate: endDateSchema,
    isUntilDischarge: z.boolean().optional(),
    timings: timingsSchema.optional(),
    note: noteSchema,
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  })

export type CreateResidentMedicationInput = z.infer<typeof createResidentMedicationSchema>
export type UpdateResidentMedicationInput = z.infer<typeof updateResidentMedicationSchema>
