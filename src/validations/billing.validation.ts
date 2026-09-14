import { z } from 'zod'
import {
  BillingAccountStatus,
  BillingCycle,
  BillingEventSourceModule,
  BillingMode,
  BillingPartyRole,
  BillingPartyType,
  BillingRunType,
  ProrationPolicy,
  SubscriptionStatus,
} from '../enums/billing.enum.js'

// ── Billing Account Validations ─────────────────────────────────────────────

export const createBillingAccountSchema = z
  .object({
    unitId: z.string().uuid('Valid unit ID is required'),
    propertyId: z.string().uuid('Valid property ID is required'),
    companyId: z.string().uuid('Valid company ID is required'),
    primaryResidentId: z.string().uuid('Valid resident ID required').optional().nullable(),
    accountName: z.string().trim().min(1, 'Account name is required'),
    billingMode: z.nativeEnum(BillingMode).default(BillingMode.INDIVIDUAL),
    billingCycle: z.nativeEnum(BillingCycle).default(BillingCycle.MONTHLY),
    billingDay: z.number().int().min(1).max(28).default(1),
    currency: z.string().default('INR'),
    notes: z.string().optional().nullable(),
  })
  .passthrough()

export const updateBillingAccountSchema = z
  .object({
    accountName: z.string().trim().min(1).optional(),
    status: z.nativeEnum(BillingAccountStatus).optional(),
    billingCycle: z.nativeEnum(BillingCycle).optional(),
    billingDay: z.number().int().min(1).max(28).optional(),
    notes: z.string().optional().nullable(),
  })
  .passthrough()

// ── Billing Party Validations ───────────────────────────────────────────────

export const createBillingPartySchema = z
  .object({
    billingAccountId: z.string().uuid('Valid billing account ID is required'),
    partyType: z.nativeEnum(BillingPartyType),
    residentId: z.string().uuid('Valid resident ID required').optional().nullable(),
    familyMemberId: z.string().uuid('Valid family member ID required').optional().nullable(),
    partyName: z.string().trim().min(1, 'Party name is required'),
    partyEmail: z.string().email('Valid email required').optional().nullable(),
    partyPhone: z.string().optional().nullable(),
    partyAddress: z.string().optional().nullable(),
    partyGstin: z.string().optional().nullable(),
    role: z.nativeEnum(BillingPartyRole).default(BillingPartyRole.PRIMARY_PAYER),
    isDefault: z.boolean().default(true),
  })
  .passthrough()

export const updateBillingPartySchema = z
  .object({
    partyName: z.string().trim().min(1).optional(),
    partyEmail: z.string().email('Valid email required').optional().nullable(),
    partyPhone: z.string().optional().nullable(),
    partyAddress: z.string().optional().nullable(),
    partyGstin: z.string().optional().nullable(),
    role: z.nativeEnum(BillingPartyRole).optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .passthrough()

// ── Subscription Validations ───────────────────────────────────────────────

export const createSubscriptionSchema = z
  .object({
    billingAccountId: z.string().uuid('Valid billing account ID is required'),
    contractId: z.string().uuid('Valid contract ID required').optional().nullable(),
    unitId: z.string().uuid('Valid unit ID is required'),
    productId: z.string().uuid('Valid product ID is required'),
    pricePlanId: z.string().uuid('Valid price plan ID required').optional().nullable(),
    description: z.string().optional().nullable(),
    quantity: z.number().positive('Quantity must be greater than 0').default(1),
    unitPrice: z.number().min(0, 'Unit price must be non-negative'),
    billingFrequency: z.nativeEnum(BillingCycle).default(BillingCycle.MONTHLY),
    prorationPolicy: z.nativeEnum(ProrationPolicy).default(ProrationPolicy.DAILY),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD'),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD')
      .optional()
      .nullable(),
    fnbPackageId: z.string().uuid('Valid FnB package ID required').optional().nullable(),
  })
  .passthrough()

export const updateSubscriptionSchema = z
  .object({
    description: z.string().optional().nullable(),
    quantity: z.number().positive().optional(),
    unitPrice: z.number().min(0).optional(),
    billingFrequency: z.nativeEnum(BillingCycle).optional(),
    prorationPolicy: z.nativeEnum(ProrationPolicy).optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD')
      .optional()
      .nullable(),
    status: z.nativeEnum(SubscriptionStatus).optional(),
  })
  .passthrough()

export const pauseSubscriptionSchema = z
  .object({
    pauseStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pause start date must be YYYY-MM-DD'),
    pauseEnd: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pause end date must be YYYY-MM-DD')
      .optional()
      .nullable(),
  })
  .passthrough()

// ── Usage Event Validations ────────────────────────────────────────────────

export const ingestBillingEventSchema = z
  .object({
    billingAccountId: z.string().uuid('Valid billing account ID').optional().nullable(),
    unitId: z.string().uuid('Valid unit ID is required'),
    residentId: z.string().uuid('Valid resident ID is required').optional().nullable(),
    propertyId: z.string().uuid('Valid property ID is required').optional().nullable(),
    sourceModule: z.nativeEnum(BillingEventSourceModule).default(BillingEventSourceModule.MANUAL),
    sourceType: z.string().trim().default('MISCELLANEOUS'),
    sourceId: z.string().uuid().optional().nullable(),
    productId: z.string().uuid().optional().nullable(),
    chargeType: z.string().trim().default('ONE_TIME'),
    description: z.string().trim().min(1, 'Description is required'),
    quantity: z.number().positive().default(1),
    unitPrice: z.number().min(0).default(0),
    amount: z.number().min(0).optional(),
    serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Service date must be YYYY-MM-DD'),
  })
  .passthrough()

export const cancelBillingEventSchema = z
  .object({
    cancellationReason: z.string().trim().min(1, 'Cancellation reason is required'),
  })
  .passthrough()

export const updateBillingEventSchema = z
  .object({
    residentId: z.string().uuid('Valid resident ID is required').optional().nullable(),
    sourceModule: z.nativeEnum(BillingEventSourceModule).optional(),
    sourceType: z.string().trim().min(1).optional(),
    chargeType: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1, 'Description is required').optional(),
    quantity: z.number().positive().optional(),
    unitPrice: z.number().min(0).optional(),
    amount: z.number().min(0).optional(),
    serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Service date must be YYYY-MM-DD').optional(),
  })
  .passthrough()

// ── Invoicing Validations ──────────────────────────────────────────────────

export const generateInvoiceSchema = z
  .object({
    billingAccountId: z.string().uuid('Valid billing account ID is required'),
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Period start must be YYYY-MM-DD'),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Period end must be YYYY-MM-DD'),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Issue date must be YYYY-MM-DD').optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be YYYY-MM-DD').optional(),
    isPreview: z.boolean().default(false),
    includePendingEvents: z.boolean().default(true).optional(),
    billingMode: z.enum(['MONTHLY', 'SUPPLEMENTARY', 'FINAL_DISCHARGE']).optional(),
    includeSubscriptions: z.boolean().default(true).optional(),
    discountType: z.enum(['FIXED', 'PERCENTAGE']).optional(),
    discountValue: z.number().min(0).optional(),
    discountNote: z.string().trim().max(500).optional().nullable(),
  })
  .passthrough()

export const taxSettingsSchema = z
  .object({
    gstEnabled: z.boolean().default(true),
    defaultTaxRate: z.number().min(0).max(100).default(18),
    cgstRate: z.number().min(0).max(100).default(9),
    sgstRate: z.number().min(0).max(100).default(9),
    companyGstNumber: z.string().optional().nullable(),
  })
  .passthrough()

export const triggerBillingRunSchema = z
  .object({
    propertyId: z.string().uuid('Valid property ID is required'),
    companyId: z.string().uuid('Valid company ID').optional().nullable(),
    billingPeriodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Billing period start must be YYYY-MM-DD'),
    billingPeriodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Billing period end must be YYYY-MM-DD'),
    runType: z.nativeEnum(BillingRunType).default(BillingRunType.MANUAL),
  })
  .passthrough()
