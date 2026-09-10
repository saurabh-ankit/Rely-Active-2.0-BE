import { z } from 'zod'
import {
  LEAVE_TYPES,
  RosterAreaStatus,
  RosterAreaType,
  ShiftEmployeeDateStatus,
  SlotGenerationMode,
  WEEK_DAYS,
} from '../enums/roster.enum.js'

const timeHHmm = z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:mm format')

const dateYmd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')

const uuid = z.string().uuid('Invalid UUID')

const workingDaysSchema = z
  .array(z.enum(WEEK_DAYS as unknown as [string, ...string[]]))
  .nullable()
  .optional()

const slotTimeRangeSchema = z
  .union([z.string().regex(/^\d{2}:\d{2}\s*-\s*\d{2}:\d{2}$/, "Slot must be 'HH:mm - HH:mm'"), z.literal(''), z.null()])
  .optional()

const optionalLocationRef = z.union([uuid, z.literal('none'), z.null()]).optional()

// ── Shift ─────────────────────────────────────────────────────────────────────
export const createShiftSchema = z.object({
  name: z.string().trim().min(1, 'Shift name is required').max(255),
  description: z.string().trim().max(500).optional().nullable(),
  startTime: timeHHmm,
  endTime: timeHHmm,
  slotGenerationMode: z.nativeEnum(SlotGenerationMode).optional(),
  slotDuration: z.coerce.number().int().min(1).optional().nullable(),
  numberOfSlots: z.coerce.number().int().min(1).optional().nullable(),
})

export const updateShiftSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  startTime: timeHHmm.optional(),
  endTime: timeHHmm.optional(),
  isActive: z.boolean().optional(),
  slotGenerationMode: z.nativeEnum(SlotGenerationMode).optional(),
  slotDuration: z.coerce.number().int().min(1).optional().nullable(),
  numberOfSlots: z.coerce.number().int().min(1).optional().nullable(),
})

// ── Roster settings / policies ────────────────────────────────────────────────
export const updateRosterSettingsSchema = z.object({
  preShiftBufferMinutes: z.coerce.number().min(0, 'Must be non-negative'),
  postShiftBufferMinutes: z.coerce.number().min(0, 'Must be non-negative'),
})

const rolePolicyItemSchema = z.object({
  role: z.string().trim().min(1, 'Role is required'),
  requiresShift: z.boolean().optional(),
  preShiftBufferMinutes: z.coerce.number().min(0).max(10080).optional(),
  postShiftBufferMinutes: z.coerce.number().min(0).max(10080).optional(),
  allowCover: z.boolean().optional(),
  allowSwap: z.boolean().optional(),
  allowDayOff: z.boolean().optional(),
})

export const updateRolePoliciesSchema = z.object({
  policies: z.array(rolePolicyItemSchema).min(1, 'Policies must be a non-empty array'),
})

// ── Employee shift assignments ────────────────────────────────────────────────
export const createEmployeeShiftSchema = z
  .object({
    employeeId: uuid,
    shiftId: uuid,
    startDate: dateYmd,
    endDate: dateYmd,
    notes: z.string().max(500).optional().nullable(),
    workingDays: workingDaysSchema,
    areaId: optionalLocationRef,
    unitId: optionalLocationRef,
    blockId: optionalLocationRef,
    floorId: optionalLocationRef,
    slotTimeRange: slotTimeRangeSchema,
  })
  .superRefine((data, ctx) => {
    const hasArea = data.areaId && data.areaId !== 'none'
    const hasBlock = data.blockId && data.blockId !== 'none'
    const hasFloor = data.floorId && data.floorId !== 'none'
    const hasUnit = data.unitId && data.unitId !== 'none'
    if (hasArea && (hasBlock || hasFloor || hasUnit)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Cannot provide both area and block/floor/unit',
        path: ['areaId'],
      })
    }
    if (hasUnit && !hasFloor) {
      ctx.addIssue({
        code: 'custom',
        message: 'floorId is required when unitId is provided',
        path: ['floorId'],
      })
    }
    if ((hasFloor || hasUnit) && !hasBlock) {
      ctx.addIssue({
        code: 'custom',
        message: 'blockId is required when floorId or unitId is provided',
        path: ['blockId'],
      })
    }
    if (data.startDate > data.endDate) {
      ctx.addIssue({
        code: 'custom',
        message: 'End date must be on or after start date',
        path: ['endDate'],
      })
    }
  })

export const bulkCreateEmployeeShiftSchema = z
  .object({
    employeeIds: z.array(uuid).min(1, 'employeeIds is required'),
    shiftId: uuid,
    startDate: dateYmd,
    endDate: dateYmd,
    notes: z.string().max(500).optional().nullable(),
    workingDays: workingDaysSchema,
    areaId: optionalLocationRef,
    areaIds: z.array(z.union([uuid, z.literal('none')])).optional(),
    unitId: optionalLocationRef,
    blockId: optionalLocationRef,
    floorId: optionalLocationRef,
    slotTimeRange: slotTimeRangeSchema,
  })
  .superRefine((data, ctx) => {
    const hasArea =
      (data.areaId && data.areaId !== 'none') ||
      (Array.isArray(data.areaIds) && data.areaIds.some((id) => id && id !== 'none'))
    const hasUnit = data.unitId && data.unitId !== 'none'
    if (hasArea && hasUnit) {
      ctx.addIssue({
        code: 'custom',
        message: 'Cannot provide both area and unit',
        path: ['unitId'],
      })
    }
  })

export const updateEmployeeShiftSchema = z
  .object({
    employeeId: uuid.optional(),
    shiftId: uuid.optional(),
    startDate: dateYmd.optional(),
    endDate: dateYmd.optional(),
    notes: z.string().max(500).optional().nullable(),
    workingDays: workingDaysSchema,
    areaId: optionalLocationRef,
    unitId: optionalLocationRef,
    blockId: optionalLocationRef,
    floorId: optionalLocationRef,
    slotTimeRange: slotTimeRangeSchema,
  })
  .superRefine((data, ctx) => {
    const hasArea = data.areaId && data.areaId !== 'none'
    const hasUnit = data.unitId && data.unitId !== 'none'
    if (hasArea && hasUnit) {
      ctx.addIssue({
        code: 'custom',
        message: 'Cannot provide both areaId and unitId',
        path: ['unitId'],
      })
    }
  })

// ── Shift employee dates ──────────────────────────────────────────────────────
export const createShiftEmployeeDateSchema = z.object({
  employeeShiftAssignmentId: uuid,
  date: dateYmd,
  status: z.nativeEnum(ShiftEmployeeDateStatus).optional(),
})

export const generateShiftEmployeeDatesSchema = z.object({
  employeeShiftAssignmentId: uuid,
  fromDate: dateYmd,
  toDate: dateYmd,
})

export const markDayOffSchema = z.object({
  leaveType: z.enum(LEAVE_TYPES as unknown as [string, ...string[]]).optional(),
  leaveNote: z.string().optional().nullable(),
})

export const coverShiftEmployeeDateSchema = z.object({
  coveredByEmployeeId: uuid,
  notes: z.string().optional().nullable(),
})

export const swapShiftEmployeeDatesSchema = z.object({
  targetDateId: uuid,
  notes: z.string().optional().nullable(),
})

// ── Shift resident pool ───────────────────────────────────────────────────────
export const createShiftResidentPoolSchema = z.object({
  shiftEmployeeDateId: uuid,
  residentId: uuid,
  fromTime: timeHHmm.optional().nullable(),
  toTime: timeHHmm.optional().nullable(),
  notes: z.string().optional().nullable(),
})

// ── Areas ─────────────────────────────────────────────────────────────────────
export const createRosterAreaSchema = z.object({
  areaName: z.string().trim().min(2).max(255),
  areaType: z.nativeEnum(RosterAreaType),
  location: z.string().trim().min(2).max(255),
  capacity: z.string().max(100).optional().nullable(),
  status: z.nativeEnum(RosterAreaStatus).optional(),
  description: z.string().max(1000).optional().nullable(),
})

export const updateRosterAreaSchema = createRosterAreaSchema.partial()
