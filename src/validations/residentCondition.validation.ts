import { z } from 'zod'
import { DiagnosisCondition } from '../enums/diagnosis.enum.js'

export const updateResidentConditionSchema = z.object({
  condition: z.enum(DiagnosisCondition, {
    message: `Condition must be one of ${Object.values(DiagnosisCondition).join(', ')}`,
  }),
  note: z
    .string()
    .trim()
    .max(5000, 'Note must be 5000 characters or fewer')
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
})

export type UpdateResidentConditionInput = z.infer<typeof updateResidentConditionSchema>
