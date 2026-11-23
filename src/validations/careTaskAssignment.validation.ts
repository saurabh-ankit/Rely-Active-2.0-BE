import { z } from 'zod'
import { businessClock, todayYmdLocal } from '../utils/roster.util.js'

const toDateOnly = (value: string): string => String(value).split('T')[0] || String(value)

const timeToMinutes = (t?: string | null): number | null => {
  if (!t) return null
  const m = t.trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (!m || !m[1] || !m[2]) return null
  let hrs = parseInt(m[1], 10)
  const mins = parseInt(m[2], 10)
  if (isNaN(hrs) || isNaN(mins)) return null
  const mer = (m[3] || '').toUpperCase()
  if (mer === 'PM' && hrs < 12) hrs += 12
  if (mer === 'AM' && hrs === 12) hrs = 0
  if (!mer && hrs > 23) return null
  return hrs * 60 + mins
}

export const createCareTaskAssignmentSchema = z
  .object({
    residentId: z.string().uuid('Valid resident ID is required'),
    familyMemberId: z.string().uuid().optional().nullable(),
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
    durationMinutes: z.coerce.number().int().min(1, 'Task duration is required'),
    time: z.string().optional().nullable(),
    times: z.array(z.string()).optional().nullable(),
    customInstructions: z.string().optional().nullable(),
    nurseId: z.string().uuid().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const startDate = toDateOnly(data.startDate)
    const today = todayYmdLocal()

    if (startDate < today) {
      ctx.addIssue({
        code: 'custom',
        message: 'Start date cannot be in the past',
        path: ['startDate'],
      })
    }

    if (data.endDate) {
      const endDate = toDateOnly(data.endDate)
      if (endDate < startDate) {
        ctx.addIssue({
          code: 'custom',
          message: 'End date cannot be earlier than start date',
          path: ['endDate'],
        })
      }
    }

    if (startDate === today) {
      const timesList: string[] = []
      if (Array.isArray(data.times) && data.times.length > 0) {
        for (const t of data.times) {
          if (t && typeof t === 'string' && t.trim()) timesList.push(t.trim())
        }
      } else if (data.time && typeof data.time === 'string' && data.time.trim()) {
        timesList.push(data.time.trim())
      }

      const nowMinutes = businessClock().minutes
      const hasPastTime = timesList.some((t) => {
        const mins = timeToMinutes(t)
        return mins !== null && mins <= nowMinutes
      })

      if (hasPastTime) {
        ctx.addIssue({
          code: 'custom',
          message: 'Scheduled time has already passed for the start date',
          path: ['times'],
        })
      }
    }
  })

export type CreateCareTaskAssignmentInput = z.infer<typeof createCareTaskAssignmentSchema>

export const updateCareTaskAssignmentSchema = z.object({
  frequency: z.union([z.number(), z.string()]).optional().nullable(),
  startDate: z.string().optional(),
  endDate: z.string().optional().nullable(),
  durationMinutes: z.coerce.number().int().min(1).optional().nullable(),
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
