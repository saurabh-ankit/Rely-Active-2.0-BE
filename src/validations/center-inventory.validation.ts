import { z } from 'zod'
export const PO_STATUSES = [
  'draft',
  'approval_pending',
  'approved',
  'rejected',
  'pending',
  'partially_received',
  'received',
  'cancelled',
] as const
// Assist restricts all genuine container package types, regardless of their contents.
export const WHOLE_PACKAGE_TYPES = ['bottle', 'tube', 'vial', 'ampoule', 'jar', 'can', 'container'] as const
const id = z.string().uuid()
const quantity = z.number().int().positive().max(4294967295)
const price = z
  .number()
  .min(0)
  .max(9999999999.99)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.0001, 'Use at most two decimal places')
const date = z.string().date()
const optionalDate = date.nullable().optional()
export const centerScopeSchema = z.object({ locationId: id })
export const centerParamsSchema = centerScopeSchema.extend({ id: id })
export const centerListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(200).default(''),
  categoryId: id.optional(),
  supplierId: id.optional(),
  itemId: id.optional(),
  status: z.enum(PO_STATUSES).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  stockFilter: z.enum(['below_min', 'below_threshold', 'out_of_stock']).optional(),
  startDate: date.optional(),
  endDate: date.optional(),
  sortBy: z.enum(['name', 'createdAt', 'poNumber', 'status', 'date']).default('createdAt'),
  sortOrder: z.enum(['ASC', 'DESC']).default('DESC'),
})
export const purchaseOrderSchema = z
  .object({
    requestId: id,
    supplierId: id,
    notes: z.string().trim().max(5000).nullable().optional(),
    items: z
      .array(z.object({ itemId: id, orderedQuantity: quantity, agreedPrice: price }).strict())
      .min(1)
      .max(100),
  })
  .strict()
  .refine(
    (data) => new Set(data.items.map((i) => i.itemId)).size === data.items.length,
    'Each item may appear only once',
  )
const receiptLine = z
  .object({
    itemId: id,
    quantity,
    unitCost: price.default(0),
    mrpPrice: price.default(0),
    transitId: z.string().trim().max(100).nullable().optional(),
    receivedDate: date,
    batchNumber: z.string().trim().max(100).nullable().optional(),
    manufacturedDate: optionalDate,
    expiryDate: optionalDate,
  })
  .strict()
  .refine(
    (d) => !d.manufacturedDate || !d.expiryDate || d.manufacturedDate <= d.expiryDate,
    'Expiry must not precede manufacture date',
  )
export const receiptSchema = z
  .object({
    requestId: id,
    supplierId: id.optional(),
    date,
    notes: z.string().trim().max(5000).nullable().optional(),
    stockEntries: z.array(receiptLine).min(1).max(100),
  })
  .strict()
export const thresholdSchema = z
  .object({
    minQuantity: z.number().int().min(0).max(4294967295),
    maxQuantity: z.number().int().min(0).max(4294967295),
    threshold: z.number().int().min(0).max(4294967295),
  })
  .strict()
  .refine(
    (d) => d.maxQuantity === 0 || (d.minQuantity <= d.maxQuantity && d.threshold <= d.maxQuantity),
    'Minimum and threshold must not exceed maximum',
  )
export const suppliersSchema = z.object({ supplierIds: z.array(id).max(100) }).strict()
export type CenterListQuery = z.infer<typeof centerListSchema>
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>
export type ReceiptInput = z.infer<typeof receiptSchema>

export const assignmentSchema = z
  .object({
    requestId: id,
    residentId: id.optional(),
    assignedUserId: id.optional(),
    date,
    notes: z.string().trim().max(5000).nullable().optional(),
    items: z
      .array(z.object({ itemId: id, quantity }).strict())
      .min(1)
      .max(100),
  })
  .strict()
  .refine((d) => Boolean(d.residentId) !== Boolean(d.assignedUserId), 'Select exactly one recipient')
  .refine((d) => new Set(d.items.map((i) => i.itemId)).size === d.items.length, 'Each item may appear only once')
export const recipientQuerySchema = z.object({
  type: z.enum(['resident', 'staff']),
  search: z.string().trim().max(200).default(''),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})
export type AssignmentInput = z.infer<typeof assignmentSchema>
