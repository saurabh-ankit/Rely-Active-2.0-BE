import { z } from 'zod'
import { BillingMode, PaymentMethod } from '../enums/billing.enum.js'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const money = z.coerce.number().finite()

export const invoicePreviewQuerySchema = z.object({
  billingMode: z.nativeEnum(BillingMode).default(BillingMode.MONTHLY),
  startDate: day.optional(),
  endDate: day.optional(),
  /** Invoice being edited: preview as if it did not exist yet. */
  editingInvoiceId: z.string().uuid().optional(),
})

export const unitsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().optional().default(''),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM')
    .optional(),
  status: z
    .enum([
      'NOT_MOVED_IN',
      'MOVED_OUT',
      'NOT_BILLED',
      'PENDING',
      'PARTIALLY_PAID',
      'OVERDUE',
      'PAID',
      'CARRIED_FORWARD',
    ])
    .optional(),
})

export const unbilledQuerySchema = z.object({ startDate: day, endDate: day })

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().optional().default(''),
})

const miscellaneousServiceSchema = z.object({
  name: z.string().trim().min(1, 'Item name is required'),
  description: z.string().trim().optional().nullable(),
  quantity: money.positive('Quantity must be greater than 0'),
  price: money,
  isCarryForward: z.boolean().optional(),
  originalInvoiceId: z.string().uuid().optional().nullable(),
})

export const saveInvoiceSchema = z
  .object({
    billingMode: z.nativeEnum(BillingMode),
    startDate: day.optional(),
    endDate: day.optional(),
    selectedServices: z.array(z.string()).default([]),
    miscellaneousServices: z.array(miscellaneousServiceSchema).optional(),
    discountType: z.enum(['percentage', 'amount']).optional().nullable(),
    discountValue: money.optional().nullable(),
    discountReason: z.string().trim().max(500).optional().nullable(),
    dueDate: day.optional().nullable(),
    notes: z.string().trim().optional().nullable(),
  })
  .refine((v) => !v.discountType || !v.discountValue || !!v.discountReason?.trim(), {
    message: 'A reason is required for a discount',
    path: ['discountReason'],
  })
  .refine((v) => v.billingMode !== BillingMode.CUSTOM || (v.startDate && v.endDate), {
    message: 'Start and end dates are required for a custom invoice',
    path: ['startDate'],
  })

export const recordPaymentSchema = z
  .object({
    paidAmount: money.positive('Paid amount must be greater than 0'),
    paymentMethod: z.nativeEnum(PaymentMethod),
    paymentReference: z.string().trim().max(255).optional().nullable(),
    notes: z.string().trim().optional().nullable(),
    handedOverTo: z.string().uuid().optional().nullable(),
    imageUrl: z.string().trim().max(1024).optional().nullable(),
  })
  // Every method except cash leaves a trail (UTR, cheque no., card slip…), so it must be recorded.
  .refine((v) => v.paymentMethod === PaymentMethod.CASH || !!v.paymentReference?.trim(), {
    message: 'A payment reference is required for non-cash payments',
    path: ['paymentReference'],
  })

export const createMiscItemSchema = z.object({
  unitId: z.string().uuid(),
  residentId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1, 'Item name is required'),
  description: z.string().trim().optional().nullable(),
  quantity: money.positive('Quantity must be greater than 0').default(1),
  price: money.positive('Price must be greater than 0'),
  serviceDate: day,
  attachmentUrl: z.string().trim().max(1024).optional().nullable(),
})

export const taxSettingsSchema = z
  .object({
    gstEnabled: z.boolean().default(true),
    defaultTaxRate: z.number().min(0).max(100).optional(),
    /** Name the Global Settings GST tab sends. */
    defaultGstRate: z.number().min(0).max(100).optional(),
    cgstRate: z.number().min(0).max(100).default(9),
    sgstRate: z.number().min(0).max(100).default(9),
    companyGstNumber: z.string().trim().optional().nullable(),
  })
  .transform(({ defaultGstRate, defaultTaxRate, ...rest }) => ({
    ...rest,
    defaultTaxRate: defaultTaxRate ?? defaultGstRate ?? 18,
  }))
