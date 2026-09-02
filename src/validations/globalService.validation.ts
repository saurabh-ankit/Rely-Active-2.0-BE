import { z } from 'zod'

const positiveInt = z.union([z.number(), z.string()]).transform((val) => {
  if (val === undefined || val === null || val === '') return null
  const parsed = parseInt(String(val), 10)
  return Number.isNaN(parsed) ? null : parsed
})

const nonNegativeNumber = z.union([z.number(), z.string()]).transform((val) => {
  if (val === undefined || val === null || val === '') return 0
  const parsed = Number(val)
  return Number.isNaN(parsed) ? 0 : parsed
})

export const propertyAssignmentSchema = z.object({
  locId: z.string().min(1),
  price: nonNegativeNumber.optional(),
  quantity: positiveInt.refine((val) => val !== null && val >= 1, {
    message: 'Quantity must be at least 1 for each assigned property',
  }),
})

export const createGlobalServiceSchema = z
  .object({
    name: z.string().trim().min(1, 'Service name is required'),
    description: z.string().optional().nullable(),
    basePrice: nonNegativeNumber.optional(),
    imageUrl: z.string().optional().nullable(),
    isActive: z.union([z.boolean(), z.string()]).optional(),
    propertyAssignments: z.any().optional(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    if (
      data.propertyAssignments === undefined ||
      data.propertyAssignments === null ||
      data.propertyAssignments === ''
    ) {
      return
    }

    let assignments: unknown[] = []
    if (Array.isArray(data.propertyAssignments)) {
      assignments = data.propertyAssignments
    } else if (typeof data.propertyAssignments === 'string') {
      try {
        const parsed = JSON.parse(data.propertyAssignments)
        assignments = Array.isArray(parsed) ? parsed : []
      } catch {
        ctx.addIssue({
          code: 'custom',
          message: 'propertyAssignments must be a valid JSON array',
          path: ['propertyAssignments'],
        })
        return
      }
    }

    for (const item of assignments) {
      const result = propertyAssignmentSchema.safeParse(item)
      if (!result.success) {
        const message = result.error.issues[0]?.message || 'Invalid property assignment'
        ctx.addIssue({
          code: 'custom',
          message,
          path: ['propertyAssignments'],
        })
        return
      }
    }
  })

export const updateGlobalServiceSchema = createGlobalServiceSchema
