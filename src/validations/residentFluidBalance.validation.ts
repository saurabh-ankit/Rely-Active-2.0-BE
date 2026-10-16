import { z } from 'zod'
import {
  BowelComfortLevel,
  FluidIntakeType,
  FluidOutputType,
  FluidUnit,
  IvFluidType,
  StoolType,
} from '../enums/fluidBalance.enum.js'

const MAX_ENTRIES_PER_SECTION = 20

const quantitySchema = z.coerce
  .number({ message: 'Quantity is required' })
  .positive('Quantity must be greater than 0')
  .max(100000, 'Quantity is too large')

const unitSchema = z.enum(FluidUnit, {
  message: `Unit must be one of ${Object.values(FluidUnit).join(', ')}`,
})

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

const shortTextSchema = (label: string) =>
  z
    .string()
    .trim()
    .max(150, `${label} must be 150 characters or fewer`)
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null))

const intakeItemSchema = z.object({
  type: z.enum(FluidIntakeType, {
    message: `Intake type must be one of ${Object.values(FluidIntakeType).join(', ')}`,
  }),
  /** Only kept for IV fluid intakes. */
  ivFluidType: z
    .enum(IvFluidType, { message: `IV fluid type must be one of ${Object.values(IvFluidType).join(', ')}` })
    .optional()
    .nullable(),
  /** Only kept for Oral / NG intakes (e.g. Water, Juice). */
  description: shortTextSchema('Intake description'),
  quantity: quantitySchema,
  unit: unitSchema,
})

const outputItemSchema = z.object({
  type: z.enum(FluidOutputType, {
    message: `Output type must be one of ${Object.values(FluidOutputType).join(', ')}`,
  }),
  quantity: quantitySchema,
  unit: unitSchema,
  collectedBy: shortTextSchema('Collected by'),
})

const bowelSchema = z.object({
  stoolType: z.enum(StoolType, {
    message: `Stool type must be one of ${Object.values(StoolType).join(', ')}`,
  }),
  comfortLevel: z.enum(BowelComfortLevel, {
    message: `Comfort level must be one of ${Object.values(BowelComfortLevel).join(', ')}`,
  }),
  note: noteSchema,
})

export const createResidentFluidBalanceSchema = z
  .object({
    recordedAt: recordedAtSchema,
    intakes: z.array(intakeItemSchema).max(MAX_ENTRIES_PER_SECTION).default([]),
    outputs: z.array(outputItemSchema).max(MAX_ENTRIES_PER_SECTION).default([]),
    bowel: bowelSchema.nullable().optional(),
  })
  .refine((data) => data.intakes.length + data.outputs.length > 0 || !!data.bowel, {
    message: 'Add at least one intake, output or bowel movement',
  })

export type CreateResidentFluidBalanceInput = z.infer<typeof createResidentFluidBalanceSchema>

export const listResidentFluidBalanceQuerySchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()), 'Invalid date')
    .optional(),
})

export type ListResidentFluidBalanceQuery = z.infer<typeof listResidentFluidBalanceQuerySchema>
