import { z } from 'zod'

export const onboardDoctorSchema = z.object({
  userId: z.string().optional(),
  doctorType: z.enum(['IN_HOUSE', 'VISITING']),
  specialization: z.string().min(1, 'Specialization is required'),
  medicalLicenseNumber: z.string().min(1, 'Medical license number is required'),
  licenseExpiryDate: z.string().optional(),
  consultationFee: z.number().optional(),
})

export const createShiftSchema = z.object({
  shiftName: z.string().min(1, 'Shift name is required'),
  code: z.string().min(1, 'Shift code is required'),
  description: z.string().optional(),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
  breakStartTime: z.string().optional(),
  breakEndTime: z.string().optional(),
  slotGenerationMode: z.enum(['AUTO_GENERATE', 'MANUAL']).optional(),
  slotDurationMinutes: z.number().optional(),
  numberOfSlots: z.number().optional(),
})

export const createFrequencySchema = z.object({
  frequencyName: z.string().min(1, 'Frequency name is required'),
  frequencyType: z.enum(['ONCE', 'DAILY', 'WEEKLY', 'BI_WEEKLY', 'MONTHLY', 'CUSTOM']),
  interval: z.number().optional(),
  timeUnit: z.enum(['DAYS', 'WEEKS', 'MONTHS']).optional(),
  allowedDaysOfWeek: z.array(z.string()).optional(),
  description: z.string().optional(),
})

export const createAssignmentSchema = z.object({
  rosterName: z.string().min(1, 'Roster assignment name is required'),
  dutyType: z.enum(['SHIFT', 'OPD_SESSION', 'ON_CALL', 'EMERGENCY', 'AD_HOC']).optional().default('SHIFT'),
  schedulingResourceId: z.string().min(1, 'Scheduling resource ID is required'),
  schedulingResourceIds: z.array(z.string()).optional(),
  shiftId: z.string().optional(),
  slotTimeRange: z.string().optional(),
  frequencyId: z.string().optional().default('freq-1'),
  effectiveFrom: z.string().min(1, 'Effective from date is required'),
  effectiveUntil: z.string().min(1, 'Effective until date is required'),
  selectedWorkingDays: z.array(z.string()).optional(),
  instructions: z.string().optional(),
  holidayPolicy: z.enum(['IGNORE', 'SKIP', 'RESCHEDULE', 'REQUIRE_COVERAGE']).optional().default('SKIP'),
  targets: z
    .array(
      z.object({
        targetType: z.enum(['PROPERTY', 'BLOCK', 'FLOOR', 'AREA', 'ROOM_UNIT', 'DEPARTMENT', 'CLINIC_VENUE', 'SERVICE']),
        targetId: z.string(),
      })
    )
    .min(1, 'At least one duty target is required'),
})

export const publishAssignmentSchema = z.object({
  overrideReason: z.string().optional(),
})

export const requestReplacementSchema = z.object({
  replacementResourceId: z.string().min(1, 'Replacement resource ID is required'),
  reason: z.string().min(1, 'Replacement reason is required'),
})

export const cancelRosterDateSchema = z.object({
  cancellationReason: z.string().min(1, 'Cancellation reason is required'),
})
