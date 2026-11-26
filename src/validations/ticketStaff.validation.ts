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

/**
 * An admin completing a ticket from the web: the same fields staff send from L3,
 * plus `close` to close it straight away (picked "Closed" instead of "Completed").
 */
export const adminCompleteTicketSchema = z.preprocess(
  (value) => value ?? {},
  z.object({
    notes: z.preprocess(
      blankToUndefined,
      z
        .string({ message: 'Resolution notes are required to complete the ticket' })
        .trim()
        .min(1, 'Resolution notes are required to complete the ticket')
        .max(2000, 'Notes must be 2000 characters or fewer'),
    ),
    invoiceAmount: invoiceAmountSchema,
    close: z.preprocess((value) => value === true || value === 'true', z.boolean()).optional(),
  }),
)

/** One or more URLs from a multipart field (a single value arrives as a string). */
const urlListSchema = z
  .preprocess(
    (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]),
    z.array(z.string().trim().min(1)).max(50),
  )
  .optional()

/**
 * An admin correcting a completed ticket's work details: resolution notes, the invoice
 * amount (blank clears it), photos / voice notes to remove (by URL) and new files.
 */
export const editTicketWorkDetailsSchema = z.preprocess(
  (value) => value ?? {},
  z.object({
    invoiceAmount: z
      .preprocess(
        (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
        z.coerce
          .number({ message: 'Invoice amount must be a number' })
          .min(0, 'Invoice amount cannot be negative')
          .max(9999999999.99, 'Invoice amount is too large')
          .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
            message: 'Invoice amount can have at most 2 decimal places',
          })
          .nullable(),
      )
      .optional(),
    removePhotoUrls: urlListSchema,
    removeVoiceNoteUrls: urlListSchema,
    notes: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : value),
      z
        .string()
        .min(1, 'Resolution notes cannot be empty')
        .max(2000, 'Notes must be 2000 characters or fewer')
        .optional(),
    ),
  }),
)

/** An admin closing an Open / In Progress ticket without completing it (e.g. raised by mistake). */
export const closeTicketSchema = z.object({
  reason: z
    .string({ message: 'Add a reason for closing the ticket' })
    .trim()
    .min(1, 'Add a reason for closing the ticket')
    .max(1000, 'Reason must be 1000 characters or fewer'),
})

export type StaffTicketListQuery = z.infer<typeof staffTicketListQuerySchema>
export type UpdateTicketTatInput = z.infer<typeof updateTicketTatSchema>
export type AddTicketWorkDetailsInput = z.infer<typeof addTicketWorkDetailsSchema>
export type CompleteTicketInput = z.infer<typeof completeTicketSchema>
export type AdminCompleteTicketInput = z.infer<typeof adminCompleteTicketSchema>
export type EditTicketWorkDetailsInput = z.infer<typeof editTicketWorkDetailsSchema>
export type CloseTicketInput = z.infer<typeof closeTicketSchema>

/** Accepting an auto-assigned ticket: the staff member sets the TAT. */
export const acceptTicketOfferSchema = z
  .object({
    tatOption: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : value),
      z
        .string({ message: 'Choose a TAT' })
        .refine((value) => ['30 mins', '1-2 hour', '2-5 hours', 'custom'].includes(value.toLowerCase()), {
          message: 'TAT must be one of: 30 mins, 1-2 hour, 2-5 hours, Custom',
        }),
    ),
    customTatDeadline: z.preprocess(
      blankToUndefined,
      z.coerce.date({ message: 'customTatDeadline must be a valid date' }).optional(),
    ),
  })
  .refine((data) => !isCustomTatOption(data.tatOption) || data.customTatDeadline !== undefined, {
    message: 'customTatDeadline is required when tatOption is "Custom"',
    path: ['customTatDeadline'],
  })
  .refine((data) => !data.customTatDeadline || data.customTatDeadline.getTime() > Date.now(), {
    message: 'customTatDeadline must be in the future',
    path: ['customTatDeadline'],
  })

/** Rejecting an auto-assigned ticket: the reason is required. */
export const rejectTicketOfferSchema = z.object({
  reason: z
    .string({ message: 'A reason is required' })
    .trim()
    .min(3, 'Please enter a reason of at least 3 characters')
    .max(500, 'Reason must be 500 characters or fewer'),
})

export type AcceptTicketOfferInput = z.infer<typeof acceptTicketOfferSchema>
export type RejectTicketOfferInput = z.infer<typeof rejectTicketOfferSchema>
