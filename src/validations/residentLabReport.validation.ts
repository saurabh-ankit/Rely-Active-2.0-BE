import { z } from 'zod'
import { PaymentMethod } from '../enums/billing.enum.js'
import { LAB_REPORT_SEVERITIES } from '../models/residentLabReport.model.js'

export const residentIdParamSchema = z.object({
  residentId: z.string().uuid('Valid resident ID is required'),
})

const optionalCost = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((val): number | null => {
    if (val === null || val === undefined || val === '') return null
    const n = typeof val === 'number' ? val : Number(val)
    return Number.isFinite(n) ? n : null
  })
  .optional()

const optionalPaymentMethod = z
  .union([z.nativeEnum(PaymentMethod), z.literal(''), z.null(), z.undefined()])
  .transform((val): PaymentMethod | null => {
    if (val === null || val === undefined || val === '') return null
    return val as PaymentMethod
  })
  .optional()

export const createResidentLabReportSchema = z.object({
  labTestSettingId: z.string().uuid('Valid lab test setting ID is required'),
  severity: z.enum(LAB_REPORT_SEVERITIES, {
    message: 'Severity must be normal, abnormal, or severe',
  }),
  reportDate: z.string({ message: 'Report date is required' }).trim().min(1, 'Report date is required'),
  notes: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
  cost: optionalCost,
  paymentMethod: optionalPaymentMethod,
  locationId: z
    .string()
    .uuid('Valid location ID is required')
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
  appointmentId: z
    .string()
    .uuid('Valid appointment ID is required')
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
})

export type CreateResidentLabReportInput = z.infer<typeof createResidentLabReportSchema>
