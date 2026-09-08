import { z } from 'zod'

export const priceOptionEnum = z.enum(['Daily', 'Monthly', 'Session Wise'])

export const createCareTaskSchema = z.object({
  careTaskName: z.string().trim().min(1, 'Care Task Name is required').max(255),
  careTaskDescription: z.string().trim().optional().nullable(),
  dailyRate: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((val) => {
      if (val === null || val === undefined || val === '') return 0
      const num = Number(val)
      return isNaN(num) || num < 0 ? 0 : num
    }),
  monthlyRate: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((val) => {
      if (val === null || val === undefined || val === '') return 0
      const num = Number(val)
      return isNaN(num) || num < 0 ? 0 : num
    }),
  sessionRate: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((val) => {
      if (val === null || val === undefined || val === '') return 0
      const num = Number(val)
      return isNaN(num) || num < 0 ? 0 : num
    }),
  sessionWiseRate: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((val) => {
      if (val === null || val === undefined || val === '') return undefined
      const num = Number(val)
      return isNaN(num) || num < 0 ? 0 : num
    }),
  careTaskPrice: z.union([z.number(), z.string(), z.null()]).optional(),
  priceOption: z.string().optional().nullable(),
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
  dailyRate: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((val) => {
      if (val === undefined) return undefined
      if (val === null || val === '') return 0
      const num = Number(val)
      return isNaN(num) || num < 0 ? 0 : num
    }),
  monthlyRate: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((val) => {
      if (val === undefined) return undefined
      if (val === null || val === '') return 0
      const num = Number(val)
      return isNaN(num) || num < 0 ? 0 : num
    }),
  sessionRate: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((val) => {
      if (val === undefined) return undefined
      if (val === null || val === '') return 0
      const num = Number(val)
      return isNaN(num) || num < 0 ? 0 : num
    }),
  sessionWiseRate: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((val) => {
      if (val === undefined) return undefined
      if (val === null || val === '') return 0
      const num = Number(val)
      return isNaN(num) || num < 0 ? 0 : num
    }),
  careTaskPrice: z.union([z.number(), z.string(), z.null()]).optional(),
  priceOption: z.string().optional().nullable(),
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

export const packageTaskItemSchema = z.object({
  taskId: z.string().trim().min(1, 'Task ID is required'),
  taskName: z.string().trim().optional(),
  careTaskName: z.string().trim().optional(),
  taskType: z.string().trim().optional(),
  dailyRate: z.union([z.number(), z.string(), z.null()]).optional(),
  monthlyRate: z.union([z.number(), z.string(), z.null()]).optional(),
  sessionRate: z.union([z.number(), z.string(), z.null()]).optional(),
  price: z.union([z.number(), z.string(), z.null()]).optional(),
  careTaskPrice: z.union([z.number(), z.string(), z.null()]).optional(),
  priceOption: z.string().trim().optional().nullable(),
  complimentaryCount: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((val) => {
      if (val === null || val === undefined || val === '') return null
      const num = Number(val)
      return isNaN(num) || num < 1 ? null : Math.floor(num)
    }),
})

export const createPackageSchema = z.object({
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
    .union([z.array(packageTaskItemSchema), z.string()])
    .optional()
    .transform((val) => {
      if (!val) return []
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

export const updatePackageSchema = z.object({
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
    .union([z.array(packageTaskItemSchema), z.string()])
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

export type CreatePackageInput = z.infer<typeof createPackageSchema>
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>
