import { z } from 'zod'

const blankToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value)

const ymd = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')

export const housekeepingShiftDateIdParamSchema = z.object({
  shiftDateId: z.string().uuid('Valid shiftDateId is required'),
})

export const housekeepingTasksQuerySchema = z
  .object({
    date: z.preprocess(blankToUndefined, ymd.optional()),
    from: z.preprocess(blankToUndefined, ymd.optional()),
    to: z.preprocess(blankToUndefined, ymd.optional()),
  })
  .refine((data) => !(data.from && !data.to) && !(data.to && !data.from), {
    message: 'Both from and to are required together',
    path: ['from'],
  })

export const housekeepingRosterQuerySchema = z.object({
  from: ymd,
  to: ymd,
})

export const housekeepingSummaryQuerySchema = z.object({
  date: z.preprocess(blankToUndefined, ymd.optional()),
})

export const completeHousekeepingTaskSchema = z.object({
  comment: z
    .preprocess(blankToUndefined, z.string().trim().min(1, 'Comment is required').max(2000).optional())
    .optional(),
})

export type HousekeepingTasksQuery = z.infer<typeof housekeepingTasksQuerySchema>
export type HousekeepingRosterQuery = z.infer<typeof housekeepingRosterQuerySchema>
export type HousekeepingSummaryQuery = z.infer<typeof housekeepingSummaryQuerySchema>
export type CompleteHousekeepingTaskInput = z.infer<typeof completeHousekeepingTaskSchema>
