import { z } from 'zod'

/** Every report on the Reports page, in display order. */
export const REPORT_KEYS = [
  'residents',
  'employees',
  'roster',
  'tickets',
  'visitors',
  'inventory',
  'assets',
  'medical',
  'dining',
  'billing',
  'events',
  'amenities',
  'feedback',
] as const

export type ReportKey = (typeof REPORT_KEYS)[number]

/** Longest date range a single export may cover. */
export const MAX_RANGE_DAYS = 366

const ymd = (name: string) =>
  z.string({ message: `Choose a ${name} date` }).regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be in YYYY-MM-DD format')

const dayNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000

const rangeFields = {
  from: ymd('From'),
  to: ymd('To'),
  status: z.string().trim().max(50).optional(),
  /** Only rows for these flats: comma-separated `property_units.id`s. */
  flat: z
    .string()
    .transform((s) => [
      ...new Set(
        s
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ])
    .pipe(z.array(z.string().uuid('Choose a valid flat')).max(200, 'Choose at most 200 flats'))
    .optional(),
  /** A tab of a report with several (e.g. `vitals` under Medical); its first tab when left out. */
  section: z.string().trim().max(60).optional(),
}

/** The date range checks shared by the export and the preview. */
const withRangeRules = <T extends z.ZodType<{ from: string; to: string }>>(schema: T) =>
  schema
    .refine((q) => !Number.isNaN(dayNumber(q.from)) && !Number.isNaN(dayNumber(q.to)), {
      message: 'Enter a valid date range',
      path: ['from'],
    })
    .refine((q) => q.from <= q.to, { message: 'The From date must be on or before the To date', path: ['to'] })
    .refine((q) => dayNumber(q.to) - dayNumber(q.from) < MAX_RANGE_DAYS, {
      message: `The date range can be at most ${MAX_RANGE_DAYS} days`,
      path: ['to'],
    })

/** A tab's further filters (e.g. `role` in Employees) come as their own params; the controller checks them. */
const filterParam = z.string().trim().max(100)

export const exportReportQuerySchema = withRangeRules(z.object(rangeFields).catchall(filterParam))

export type ExportReportQuery = z.infer<typeof exportReportQuerySchema>

/** Rows per page the preview table offers. */
export const PREVIEW_PAGE_SIZES = [25, 50, 100] as const

export const previewReportQuerySchema = withRangeRules(
  z
    .object({
      ...rangeFields,
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce
        .number()
        .int()
        .refine((n) => (PREVIEW_PAGE_SIZES as readonly number[]).includes(n), 'Rows per page must be 25, 50 or 100')
        .default(25),
    })
    .catchall(filterParam),
)

export type PreviewReportQuery = z.infer<typeof previewReportQuerySchema>
