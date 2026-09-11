import { z } from 'zod'

export const billingTypeEnum = z.enum(['MONTHLY', 'SESSION'])

export const createCareTaskSchema = z.object({
  careTaskName: z.string().trim().min(1, 'Care Task Name is required').max(255),
  careTaskDescription: z.string().trim().optional().nullable(),
  billingType: z
    .string({ message: 'Billing Type is mandatory (MONTHLY or SESSION)' })
    .trim()
    .transform((val) => {
      const u = val.toUpperCase()
      if (u.startsWith('SESS')) return 'SESSION'
      if (u.startsWith('MONTH')) return 'MONTHLY'
      return u
    })
    .refine((val) => val === 'MONTHLY' || val === 'SESSION', {
      message: 'Billing Type is mandatory and must be MONTHLY or SESSION',
    }),
  price: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((val) => {
      if (val === null || val === undefined || val === '') return 0
      const num = Number(val)
      return isNaN(num) || num < 0 ? 0 : num
    }),
  careTaskImage: z.string().trim().optional().nullable(),
  propertyId: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((val) => {
      if (!val || val === 'null' || val === 'undefined' || val === 'all') return null
      return val
    }),
  isActive: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => {
      if (val === undefined) return true
      if (typeof val === 'boolean') return val
      return val === 'true' || val === '1'
    }),
})

export const updateCareTaskSchema = z.object({
  careTaskName: z.string().trim().min(1, 'Care Task Name cannot be empty').max(255).optional(),
  careTaskDescription: z.string().trim().optional().nullable(),
  billingType: z
    .string()
    .trim()
    .optional()
    .transform((val) => {
      if (!val) return undefined
      const u = val.toUpperCase()
      if (u.startsWith('SESS')) return 'SESSION'
      if (u.startsWith('MONTH')) return 'MONTHLY'
      return u
    })
    .refine((val) => val === undefined || val === 'MONTHLY' || val === 'SESSION', {
      message: 'Billing Type must be MONTHLY or SESSION',
    }),
  price: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((val) => {
      if (val === undefined) return undefined
      if (val === null || val === '') return 0
      const num = Number(val)
      return isNaN(num) || num < 0 ? 0 : num
    }),
  careTaskImage: z.string().trim().optional().nullable(),
  propertyId: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((val) => {
      if (val === undefined) return undefined
      if (!val || val === 'null' || val === 'undefined' || val === 'all') return null
      return val
    }),
  isActive: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => {
      if (val === undefined) return undefined
      if (typeof val === 'boolean') return val
      return val === 'true' || val === '1'
    }),
})

export const createTaskSchema = createCareTaskSchema
export const updateTaskSchema = updateCareTaskSchema

export type CreateCareTaskInput = z.infer<typeof createCareTaskSchema>
export type UpdateCareTaskInput = z.infer<typeof updateCareTaskSchema>
export type CreateTaskInput = CreateCareTaskInput
export type UpdateTaskInput = UpdateCareTaskInput

export const packageTaskItemSchema = z
  .object({
    taskId: z.string().trim().optional(),
    featureId: z.string().trim().optional(),
    taskName: z.string().trim().optional(),
    careTaskName: z.string().trim().optional(),
    taskType: z.string().trim().optional(),
    billingType: z.string().trim().optional(),
    price: z.union([z.number(), z.string(), z.null()]).optional(),
    complimentaryCount: z
      .union([z.number(), z.string(), z.null()])
      .optional()
      .transform((val) => {
        if (val === null || val === undefined || val === '') return 1
        const num = Number(val)
        return isNaN(num) || num < 0 ? 0 : Math.floor(num)
      }),
  })
  .refine((data) => Boolean(data.taskId || data.featureId), {
    message: 'Either taskId or featureId is required',
  })
  .transform((data) => ({
    ...data,
    taskId: (data.taskId || data.featureId) as string,
    featureId: (data.featureId || data.taskId) as string,
  }))

export const packageTaskElementSchema = z.union([
  packageTaskItemSchema,
  z
    .string()
    .trim()
    .min(1)
    .transform((id) => ({
      taskId: id,
      featureId: id,
      complimentaryCount: 1,
    })),
])

export const createPackageSchema = z
  .object({
    packageName: z.string().trim().min(1, 'Package name is required').max(255),
    packageCost: z.union([z.number(), z.string()]).transform((val) => {
      const num = Number(val)
      return isNaN(num) || num < 0 ? 0 : num
    }),
    duration: z
      .union([z.literal('Monthly'), z.literal('Yearly')])
      .default('Monthly')
      .optional()
      .transform((val) => val || 'Monthly'),
    tasks: z
      .union([z.array(packageTaskElementSchema), z.string()])
      .optional()
      .transform((val) => {
        if (!val) return undefined
        if (typeof val === 'string') {
          try {
            const parsed = JSON.parse(val)
            return Array.isArray(parsed) ? parsed : []
          } catch {
            return []
          }
        }
        return val
      }),
    features: z
      .union([z.array(packageTaskElementSchema), z.string()])
      .optional()
      .transform((val) => {
        if (!val) return undefined
        if (typeof val === 'string') {
          try {
            const parsed = JSON.parse(val)
            return Array.isArray(parsed) ? parsed : []
          } catch {
            return []
          }
        }
        return val
      }),
    description: z.string().trim().optional().nullable(),
    propertyId: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((val) => {
        if (!val || val === 'null' || val === 'undefined' || val === 'all') return null
        return val
      }),
    isActive: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((val) => {
        if (val === undefined) return true
        if (typeof val === 'boolean') return val
        return val === 'true' || val === '1'
      }),
  })
  .transform((data) => ({
    ...data,
    tasks: data.tasks ?? data.features ?? [],
  }))

export const updatePackageSchema = z
  .object({
    packageName: z.string().trim().min(1, 'Package name is required').max(255).optional(),
    packageCost: z
      .union([z.number(), z.string()])
      .optional()
      .transform((val) => {
        if (val === undefined) return undefined
        const num = Number(val)
        return isNaN(num) || num < 0 ? 0 : num
      }),
    duration: z.union([z.literal('Monthly'), z.literal('Yearly')]).optional(),
    tasks: z
      .union([z.array(packageTaskElementSchema), z.string()])
      .optional()
      .transform((val) => {
        if (val === undefined) return undefined
        if (typeof val === 'string') {
          try {
            const parsed = JSON.parse(val)
            return Array.isArray(parsed) ? parsed : []
          } catch {
            return []
          }
        }
        return val
      }),
    features: z
      .union([z.array(packageTaskElementSchema), z.string()])
      .optional()
      .transform((val) => {
        if (val === undefined) return undefined
        if (typeof val === 'string') {
          try {
            const parsed = JSON.parse(val)
            return Array.isArray(parsed) ? parsed : []
          } catch {
            return []
          }
        }
        return val
      }),
    description: z.string().trim().optional().nullable(),
    propertyId: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((val) => {
        if (val === undefined) return undefined
        if (!val || val === 'null' || val === 'undefined' || val === 'all') return null
        return val
      }),
    isActive: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((val) => {
        if (val === undefined) return undefined
        if (typeof val === 'boolean') return val
        return val === 'true' || val === '1'
      }),
  })
  .transform((data) => ({
    ...data,
    tasks: data.tasks !== undefined ? data.tasks : data.features,
  }))

export type CreatePackageInput = z.infer<typeof createPackageSchema>
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>
