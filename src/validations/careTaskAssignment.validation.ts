import { z } from 'zod'

export const createCareTaskAssignmentSchema = z.object({
  residentId: z.string().uuid('Valid resident ID is required'),
  taskId: z.string().uuid('Valid care task ID is required'),
  propertyId: z.string().uuid().optional().nullable(),
  packageSubscriptionId: z.string().uuid().optional().nullable(),
  carePackageId: z.string().uuid().optional().nullable(),
  source: z.enum(['PACKAGE', 'ADDON']).optional().nullable(),
  billingType: z.enum(['MONTHLY', 'SESSION', 'Monthly', 'Session Wise']).optional().nullable(),
  price: z.union([z.number(), z.string()]).optional().nullable(),
  frequency: z.union([z.number(), z.string()]).optional().nullable(),
  startDate: z.string().min(1, 'Start Date is required'),
  endDate: z.string().optional().nullable(),
  time: z.string().optional().nullable(),
  times: z.array(z.string()).optional().nullable(),
  customInstructions: z.string().optional().nullable(),
  nurseId: z.string().uuid().optional().nullable(),
})

export type CreateCareTaskAssignmentInput = z.infer<typeof createCareTaskAssignmentSchema>

export const updateCareTaskAssignmentSchema = z.object({
  frequency: z.union([z.number(), z.string()]).optional().nullable(),
  startDate: z.string().optional(),
  endDate: z.string().optional().nullable(),
  time: z.string().optional(),
  nurseId: z.string().uuid().optional().nullable(),
  customInstructions: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'STOPPED', 'CANCELLED']).optional(),
  billingType: z.enum(['MONTHLY', 'SESSION', 'Monthly', 'Session Wise']).optional().nullable(),
  source: z.enum(['PACKAGE', 'ADDON']).optional().nullable(),
  price: z.union([z.number(), z.string()]).optional().nullable(),
})

export type UpdateCareTaskAssignmentInput = z.infer<typeof updateCareTaskAssignmentSchema>

export const completeCareTaskAssignmentSchema = z.object({
  completedAt: z.union([z.string(), z.date()]).optional(),
  nurseId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
})

export type CompleteCareTaskAssignmentInput = z.infer<typeof completeCareTaskAssignmentSchema>
