import { z } from 'zod'
import { FeedbackAnswerType, FeedbackAudience } from '../enums/feedback.enum.js'

const optionalDescription = z
  .string()
  .trim()
  .max(2000, 'Description must be 2000 characters or fewer')
  .optional()
  .or(z.literal('').transform(() => undefined))

// ── Advertisements (multipart, so every field arrives as a string) ───────────

export const createAdvertisementSchema = z.object({
  title: z
    .string({ message: 'Title is required' })
    .trim()
    .min(1, 'Title is required')
    .max(255, 'Title must be 255 characters or fewer'),
  description: optionalDescription,
})

export const updateAdvertisementSchema = createAdvertisementSchema.partial()

export const updateAdvertisementStatusSchema = z.object({
  isActive: z.boolean({ message: 'isActive must be true or false' }),
})

// ── Feedback forms ───────────────────────────────────────────────────────────

const CHOICE_TYPES: FeedbackAnswerType[] = [FeedbackAnswerType.SINGLE_CHOICE, FeedbackAnswerType.MULTIPLE_CHOICE]

const questionSchema = z
  .object({
    questionText: z.string({ message: 'Question is required' }).trim().min(1, 'Question is required'),
    answerType: z.enum(FeedbackAnswerType, { message: 'Select an answer type' }),
    options: z.array(z.string().trim().min(1, 'Options cannot be empty')).optional().nullable(),
    ratingScale: z.number().int().min(2).max(10).optional().nullable(),
    isRequired: z.boolean().optional(),
  })
  .superRefine((q, ctx) => {
    if (CHOICE_TYPES.includes(q.answerType)) {
      const options = q.options ?? []
      if (options.length < 2) {
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'Choice questions need at least 2 options' })
      }
      if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'Options must be unique' })
      }
    }
  })

const futureDate = z.coerce
  .date({ message: 'Valid expiry date is required' })
  .refine((d) => d.getTime() > Date.now(), 'Expiry date must be in the future')

export const saveFeedbackFormSchema = z.object({
  title: z
    .string({ message: 'Form title is required' })
    .trim()
    .min(1, 'Form title is required')
    .max(255, 'Form title must be 255 characters or fewer'),
  expiryDate: futureDate,
  questions: z.array(questionSchema).min(1, 'Add at least one question'),
})

export const sendFeedbackFormSchema = z.object({
  audience: z.enum(FeedbackAudience, { message: 'Choose residents, employees or both' }),
})

export const submitFeedbackSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().uuid('Valid question ID is required'),
      answerText: z.string().trim().optional().nullable(),
      selectedOptions: z.array(z.string()).optional().nullable(),
      ratingValue: z.number().int().optional().nullable(),
    }),
  ),
})

export type SaveFeedbackFormInput = z.infer<typeof saveFeedbackFormSchema>
export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>
