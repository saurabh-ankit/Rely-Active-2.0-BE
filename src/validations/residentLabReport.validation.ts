import { z } from 'zod'
import { LabPaymentMethod } from '../enums/labReport.enum.js'
import { LAB_REPORT_SEVERITIES } from '../models/residentLabReport.model.js'

export const residentIdParamSchema = z.object({
  residentId: z.string().uuid('Valid resident ID is required'),
})

export const residentClinicalItemParamSchema = z.object({
  residentId: z.string().uuid('Valid resident ID is required'),
  id: z.string().uuid('Valid record ID is required'),
})

const todayYmdLocal = (): string => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const reportDateSchema = z
  .string({ message: 'Report date is required' })
  .trim()
  .min(1, 'Report date is required')
  .refine((val) => /^\d{4}-\d{2}-\d{2}$/.test(val), 'Report date must be YYYY-MM-DD')
  .refine((val) => val <= todayYmdLocal(), {
    message: 'Report date cannot be a future date',
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
  .union([z.nativeEnum(LabPaymentMethod), z.literal(''), z.null(), z.undefined()])
  .transform((val): LabPaymentMethod | null => {
    if (val === null || val === undefined || val === '') return null
    return val as LabPaymentMethod
  })
  .optional()

const booleanFromForm = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((val) => val === true || val === 'true')

const labReportBodyBase = z.object({
  labTestSettingId: z.string().uuid('Valid lab test setting ID is required'),
  severity: z.enum(LAB_REPORT_SEVERITIES, {
    message: 'Severity must be normal, abnormal, or severe',
  }),
  reportDate: reportDateSchema,
  notes: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
  cost: optionalCost,
  paymentMethod: optionalPaymentMethod,
  isPaid: booleanFromForm.optional().default(false),
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

const requirePaymentWhenPaid = <T extends z.ZodTypeAny>(schema: T) =>
  schema.superRefine((data, ctx) => {
    const body = data as { isPaid?: boolean; paymentMethod?: LabPaymentMethod | null }
    if (body.isPaid && !body.paymentMethod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Payment method is required when already paid',
        path: ['paymentMethod'],
      })
    }
  })

export const createResidentLabReportSchema = requirePaymentWhenPaid(labReportBodyBase)

export const updateResidentLabReportSchema = requirePaymentWhenPaid(
  labReportBodyBase.omit({ locationId: true, appointmentId: true }).partial().extend({
    isPaid: booleanFromForm.optional(),
    removeReceipt: booleanFromForm.optional(),
  }),
)

export type CreateResidentLabReportInput = z.infer<typeof createResidentLabReportSchema>
export type UpdateResidentLabReportInput = z.infer<typeof updateResidentLabReportSchema>
