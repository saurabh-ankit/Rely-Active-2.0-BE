import { z } from 'zod'

export const createResidentDocumentSchema = z.object({
  name: z
    .string({ message: 'Document name is required' })
    .trim()
    .min(1, 'Document name is required')
    .max(255, 'Document name must be 255 characters or fewer'),
  note: z
    .string()
    .trim()
    .max(5000, 'Note must be 5000 characters or fewer')
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
})

export type CreateResidentDocumentInput = z.infer<typeof createResidentDocumentSchema>
