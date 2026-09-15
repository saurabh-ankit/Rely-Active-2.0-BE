import { z } from 'zod'

// Multipart fields arrive as strings; treat blank values as "not provided".
const blankToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value)

export const staffTicketIdParamSchema = z.object({
  id: z.string().uuid('Valid ticket ID is required'),
})

export const staffTicketListQuerySchema = z.object({
  status: z
    .preprocess(
      (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
      z.enum(['ALL', 'ACTIVE', 'OPEN', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED']),
    )
    .optional(),
  search: z.string().trim().max(100, 'Search must be 100 characters or fewer').optional(),
  department: z
    .preprocess(
      (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
      z.enum(['RNM', 'CON'], { message: 'department must be RNM or CON' }),
    )
    .optional(),
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().int().min(1).max(100, 'Limit cannot exceed 100').default(20),
})

export const isCustomTatOption = (option?: string | null) => option?.toLowerCase() === 'custom'

export const updateTicketTatSchema = z
  .object({
    tatOption: z.preprocess(blankToUndefined, z.string().trim().max(64, 'TAT option is too long').optional()),
    customTatDeadline: z.preprocess(
      blankToUndefined,
      z.coerce.date({ message: 'customTatDeadline must be a valid date' }).optional(),
    ),
    note: z
      .string({ message: 'A note is required when updating TAT' })
      .trim()
      .min(3, 'A note of at least 3 characters is required when updating TAT')
      .max(1000, 'Note must be 1000 characters or fewer'),
  })
  .refine((data) => data.tatOption !== undefined || data.customTatDeadline !== undefined, {
    message: 'Provide tatOption or customTatDeadline to update TAT',
    path: ['tatOption'],
  })
  .refine((data) => !isCustomTatOption(data.tatOption) || data.customTatDeadline !== undefined, {
    message: 'customTatDeadline is required when tatOption is "custom"',
    path: ['customTatDeadline'],
  })
  .refine((data) => !data.customTatDeadline || data.customTatDeadline.getTime() > Date.now(), {
    message: 'customTatDeadline must be in the future',
    path: ['customTatDeadline'],
  })

const invoiceAmountSchema = z.preprocess(
  blankToUndefined,
  z.coerce
    .number({ message: 'Invoice amount must be a number' })
    .min(0, 'Invoice amount cannot be negative')
    .max(9999999999.99, 'Invoice amount is too large')
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
      message: 'Invoice amount can have at most 2 decimal places',
    })
    .optional(),
)

export const addTicketWorkDetailsSchema = z.object({
  invoiceAmount: invoiceAmountSchema,
})

// Everything on completion is optional, so the request may arrive without a body at all.
export const completeTicketSchema = z.preprocess(
  (value) => value ?? {},
  z.object({
    notes: z.preprocess(
      blankToUndefined,
      z.string().trim().max(2000, 'Notes must be 2000 characters or fewer').optional(),
    ),
    invoiceAmount: invoiceAmountSchema,
  }),
)

export type StaffTicketListQuery = z.infer<typeof staffTicketListQuerySchema>
export type UpdateTicketTatInput = z.infer<typeof updateTicketTatSchema>
export type AddTicketWorkDetailsInput = z.infer<typeof addTicketWorkDetailsSchema>
export type CompleteTicketInput = z.infer<typeof completeTicketSchema>
