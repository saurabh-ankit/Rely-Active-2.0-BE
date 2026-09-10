import type { Response } from 'express'
import { Op } from 'sequelize'
import * as XLSX from 'xlsx'
import sequelize from '../../config/db/index.js'
import { logger } from '../../config/logger.js'
import { OccupancyStatus } from '../../enums/propertyUnit.enum.js'
import { LEAVE_TYPES, RosterAreaStatus, ShiftEmployeeDateStatus, type LeaveType } from '../../enums/roster.enum.js'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import {
  Property,
  PropertyBlock,
  PropertyFloor,
  PropertyUnit,
  Role,
  Shift,
  ShiftAssignment,
  ShiftArea,
  ShiftDate,
  ShiftResidentPool,
  ShiftRolePolicy,
  ShiftSetting,
  User,
  UserDetail,
  UserLocation,
} from '../../models/index.js'
import {
  asParamString,
  doSlotRangesOverlap,
  eachDay,
  hasWindowStartPassedOnDate,
  isSlotWithinShift,
  parseSlotTimeRange,
  parseTimeToMinutes,
  resolveLifecycleRosterStatus,
  todayYmdLocal,
} from '../../utils/roster.util.js'
import { errorResponse, successResponse } from '../../utils/response/index.js'

// ── Shift settings / policies / CRUD ──────────────────────────────────────────
export const getSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    if (!locationId) {
      return res.status(400).json(errorResponse('Location ID is required'))
    }

    const settings = await ShiftSetting.findOne({ where: { locationId } })
    if (!settings) {
      return res.status(200).json(
        successResponse('Roster settings fetched', {
          locationId,
          preShiftBufferMinutes: 60,
          postShiftBufferMinutes: 120,
        }),
      )
    }
    return res.status(200).json(successResponse('Roster settings fetched', settings))
  } catch (error) {
    logger.error({ err: error }, 'getSettings failed')
    return res.status(500).json(errorResponse('Failed to fetch roster settings'))
  }
}

export const updateSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    if (!locationId) {
      return res.status(400).json(errorResponse('Location ID is required'))
    }

    const { preShiftBufferMinutes, postShiftBufferMinutes } = req.body
    const pre = Number(preShiftBufferMinutes)
    const post = Number(postShiftBufferMinutes)

    if (Number.isNaN(pre) || Number.isNaN(post) || pre < 0 || post < 0) {
      return res.status(400).json(errorResponse('Buffer values must be non-negative numbers'))
    }

    const userId = req.user?.id ?? null
    let settings = await ShiftSetting.findOne({ where: { locationId } })

    if (settings) {
      await settings.update({
        preShiftBufferMinutes: pre,
        postShiftBufferMinutes: post,
        updatedBy: userId,
      })
    } else {
      settings = await ShiftSetting.create({
        locationId,
        preShiftBufferMinutes: pre,
        postShiftBufferMinutes: post,
        createdBy: userId,
      })
    }

    return res.status(200).json(successResponse('Roster settings saved successfully', settings))
  } catch (error) {
    logger.error({ err: error }, 'updateSettings failed')
    return res.status(500).json(errorResponse('Failed to save roster settings'))
  }
}

export const getRolePolicies = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    if (!locationId) {
      return res.status(400).json(errorResponse('Location ID is required'))
    }

    const policies = await ShiftRolePolicy.findAll({
      where: { locationId },
      raw: true,
    })

    return res.status(200).json(successResponse('Roster role policies fetched', policies))
  } catch (error) {
    logger.error({ err: error }, 'getRolePolicies failed')
    return res.status(500).json(errorResponse('Failed to fetch role policies'))
  }
}

export const updateRolePolicies = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    if (!locationId) {
      return res.status(400).json(errorResponse('Location ID is required'))
    }

    const { policies } = req.body
    if (!Array.isArray(policies)) {
      return res.status(400).json(errorResponse('Policies must be an array'))
    }

    const userId = req.user?.id ?? null
    const results = []

    for (const policy of policies) {
      const { role, requiresShift, preShiftBufferMinutes, postShiftBufferMinutes, allowCover, allowSwap, allowDayOff } =
        policy

      if (!role) {
        return res.status(400).json(errorResponse('Role is required for each policy item'))
      }

      const preMinutes = preShiftBufferMinutes !== undefined ? Number(preShiftBufferMinutes) : 60
      const postMinutes = postShiftBufferMinutes !== undefined ? Number(postShiftBufferMinutes) : 120

      if (Number.isNaN(preMinutes) || preMinutes < 0 || preMinutes > 10080) {
        return res
          .status(400)
          .json(errorResponse(`Pre-shift buffer for ${role} must be a number between 0 and 10080 minutes (7 days)`))
      }
      if (Number.isNaN(postMinutes) || postMinutes < 0 || postMinutes > 10080) {
        return res
          .status(400)
          .json(errorResponse(`Post-shift buffer for ${role} must be a number between 0 and 10080 minutes (7 days)`))
      }

      const normalizedRole = String(role).toLowerCase()
      let record = await ShiftRolePolicy.findOne({
        where: { locationId, role: normalizedRole },
      })

      const updateData = {
        requiresShift: requiresShift !== undefined ? !!requiresShift : true,
        preShiftBufferMinutes: preMinutes,
        postShiftBufferMinutes: postMinutes,
        allowCover: allowCover !== undefined ? !!allowCover : true,
        allowSwap: allowSwap !== undefined ? !!allowSwap : true,
        allowDayOff: allowDayOff !== undefined ? !!allowDayOff : true,
        updatedBy: userId,
      }

      const beforeData = record
        ? {
            requiresShift: record.requiresShift,
            preShiftBufferMinutes: record.preShiftBufferMinutes,
            postShiftBufferMinutes: record.postShiftBufferMinutes,
            allowCover: record.allowCover,
            allowSwap: record.allowSwap,
            allowDayOff: record.allowDayOff,
          }
        : null

      if (record) {
        await record.update(updateData)
      } else {
        record = await ShiftRolePolicy.create({
          locationId,
          role: normalizedRole,
          ...updateData,
          createdBy: userId,
        })
      }

      logger.info({
        event: 'ROSTER_POLICY_UPDATED',
        locationId,
        role: normalizedRole,
        changedBy: userId,
        before: beforeData,
        after: updateData,
      })

      results.push(record)
    }

    return res.status(200).json(successResponse('Roster role policies saved successfully', results))
  } catch (error) {
    logger.error({ err: error }, 'updateRolePolicies failed')
    return res.status(500).json(errorResponse('Failed to save role policies'))
  }
}

export const listShifts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    const shifts = await Shift.findAll({
      where: { isDeleted: false, locationId },
      order: [['createdAt', 'ASC']],
    })

    const shiftsWithAssignments = await Promise.all(
      shifts.map(async (shift) => {
        const count = await ShiftAssignment.count({
          where: { shiftId: shift.id, isDeleted: false },
        })
        return {
          ...shift.toJSON(),
          isAssigned: count > 0,
          assignmentCount: count,
        }
      }),
    )

    return res.status(200).json(successResponse('Shifts fetched', { shifts: shiftsWithAssignments }))
  } catch (error) {
    logger.error({ err: error }, 'listShifts failed')
    return res.status(500).json(errorResponse('Failed to fetch shifts'))
  }
}

export const getShift = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = asParamString(req.params.id)
    const shift = await Shift.findOne({ where: { id, isDeleted: false } })
    if (!shift) return res.status(404).json(errorResponse('Shift not found'))
    return res.status(200).json(successResponse('Shift fetched', shift))
  } catch (error) {
    logger.error({ err: error }, 'getShift failed')
    return res.status(500).json(errorResponse('Failed to fetch shift'))
  }
}

export const createShift = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    const { name, description, startTime, endTime, slotGenerationMode, slotDuration, numberOfSlots } = req.body

    if (!startTime || !endTime) {
      return res.status(400).json(errorResponse('Start time and end time are required'))
    }
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      return res.status(400).json(errorResponse('Invalid time format. Use HH:mm'))
    }
    if (parseTimeToMinutes(startTime) === null || parseTimeToMinutes(endTime) === null) {
      return res.status(400).json(errorResponse('Invalid time values'))
    }

    const sameName = await Shift.findOne({
      where: { locationId, name: { [Op.like]: name }, isDeleted: false },
    })
    if (sameName) {
      return res.status(400).json(errorResponse('Shift name already exists for this location'))
    }

    const createdBy = req.user?.id ?? null
    const shift = await Shift.create({
      name,
      description: description ?? '',
      startTime,
      endTime,
      locationId,
      ...(slotGenerationMode !== undefined ? { slotGenerationMode } : {}),
      ...(slotDuration !== undefined ? { slotDuration: slotDuration ? Number(slotDuration) : null } : {}),
      ...(numberOfSlots !== undefined ? { numberOfSlots: numberOfSlots ? Number(numberOfSlots) : null } : {}),
      createdBy,
    })
    return res.status(201).json(successResponse('Shift created', shift))
  } catch (error) {
    logger.error({ err: error }, 'createShift failed')
    return res.status(500).json(errorResponse('Failed to create shift'))
  }
}

export const updateShift = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = asParamString(req.params.id)
    const locationId = asParamString(req.params.locationId)
    const payload = req.body as Partial<Shift> & {
      startTime?: string
      endTime?: string
      description?: string | null
    }

    if (payload.startTime && !/^\d{2}:\d{2}$/.test(payload.startTime)) {
      return res.status(400).json(errorResponse('Invalid time format. Use HH:mm'))
    }
    if (payload.endTime && !/^\d{2}:\d{2}$/.test(payload.endTime)) {
      return res.status(400).json(errorResponse('Invalid time format. Use HH:mm'))
    }
    if (payload.startTime && parseTimeToMinutes(payload.startTime) === null) {
      return res.status(400).json(errorResponse('Invalid start time value'))
    }
    if (payload.endTime && parseTimeToMinutes(payload.endTime) === null) {
      return res.status(400).json(errorResponse('Invalid end time value'))
    }

    const shift = await Shift.findOne({ where: { id, isDeleted: false } })
    if (!shift) return res.status(404).json(errorResponse('Shift not found'))

    const nextStart = payload.startTime ?? shift.startTime
    const nextEnd = payload.endTime ?? shift.endTime
    if (!nextStart || !nextEnd) {
      return res.status(400).json(errorResponse('Start time and end time are required'))
    }

    const updatedBy = req.user?.id ?? null
    const { description, ...rest } = payload
    await shift.update({
      ...rest,
      ...(description !== undefined ? { description: description ?? '' } : {}),
      locationId,
      updatedBy,
    })
    return res.status(200).json(successResponse('Shift updated', shift))
  } catch (error) {
    logger.error({ err: error }, 'updateShift failed')
    return res.status(500).json(errorResponse('Failed to update shift'))
  }
}

export const deleteShift = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = asParamString(req.params.id)
    const shift = await Shift.findOne({ where: { id, isDeleted: false } })
    if (!shift) return res.status(404).json(errorResponse('Shift not found'))

    const assignmentCount = await ShiftAssignment.count({
      where: { shiftId: id, isDeleted: false },
    })

    if (assignmentCount > 0) {
      return res
        .status(400)
        .json(errorResponse('Cannot delete shift because it is currently assigned to one or more employees.'))
    }

    await shift.update({ isDeleted: true, updatedBy: req.user?.id ?? null })
    return res.status(200).json(successResponse('Shift deleted'))
  } catch (error) {
    logger.error({ err: error }, 'deleteShift failed')
    return res.status(500).json(errorResponse('Failed to delete shift'))
  }
}

// ── Employee shift assignments ────────────────────────────────────────────────
interface Interval {
  start: Date
  end: Date
}

function parseDateTimeToUTC(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = timeStr.split(':').map(Number)
  return new Date(Date.UTC(year!, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0))
}

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function isWorkingOnHelper(workingDays: string[] | null | undefined, dateStr: string): boolean {
  if (!workingDays || workingDays.length === 0) return true
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(Date.UTC(year!, (month ?? 1) - 1, day ?? 1))
  return workingDays.includes(WEEKDAY_NAMES[d.getUTCDay()]!)
}

function resolveEffectiveShiftWindow(
  shiftStart: string | null | undefined,
  shiftEnd: string | null | undefined,
  slotTimeRange?: string | null,
): { start: string | null; end: string | null } {
  if (typeof slotTimeRange === 'string' && slotTimeRange.trim()) {
    const parts = slotTimeRange.split('-').map((p) => p.trim())
    if (parts.length === 2 && parts[0] && parts[1]) {
      return { start: parts[0], end: parts[1] }
    }
  }
  return { start: shiftStart || null, end: shiftEnd || null }
}

function getWorkIntervals(
  startDateStr: string,
  endDateStr: string,
  startTime: string | null,
  endTime: string | null,
  workingDays: string[] | null | undefined,
): Interval[] {
  const intervals: Interval[] = []
  const [sYear, sMonth, sDay] = startDateStr.split('-').map(Number)
  const [eYear, eMonth, eDay] = endDateStr.split('-').map(Number)
  const startUTC = new Date(Date.UTC(sYear!, (sMonth ?? 1) - 1, sDay ?? 1))
  const endUTC = new Date(Date.UTC(eYear!, (eMonth ?? 1) - 1, eDay ?? 1))
  const startT = startTime || '00:00'
  const endT = endTime || '23:59'

  const current = new Date(startUTC.getTime())
  while (current <= endUTC) {
    const year = current.getUTCFullYear()
    const month = String(current.getUTCMonth() + 1).padStart(2, '0')
    const day = String(current.getUTCDate()).padStart(2, '0')
    const dStr = `${year}-${month}-${day}`

    if (isWorkingOnHelper(workingDays, dStr)) {
      const intervalStart = parseDateTimeToUTC(dStr, startT)
      const intervalEnd = parseDateTimeToUTC(dStr, endT)
      if (startT > endT) {
        intervalEnd.setUTCDate(intervalEnd.getUTCDate() + 1)
      }
      intervals.push({ start: intervalStart, end: intervalEnd })
    }
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return intervals
}

function intervalsOverlap(a: Interval, b: Interval): boolean {
  return Math.max(a.start.getTime(), b.start.getTime()) < Math.min(a.end.getTime(), b.end.getTime())
}

async function checkShiftAssignmentOverlap(
  employeeId: string,
  newStartDate: string,
  newEndDate: string,
  newStartTime: string | null,
  newEndTime: string | null,
  newShiftId?: string,
  excludeAssignmentId?: string,
  newWorkingDays?: string[] | null,
  _newAreaId?: string | null,
): Promise<{
  locationName: string
  shiftName: string
  startDate: string
  endDate: string
  shiftTimes: string
} | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { employeeId, isDeleted: false }
  if (excludeAssignmentId) where.id = { [Op.ne]: excludeAssignmentId }

  const existing = await ShiftAssignment.findAll({
    where,
    attributes: [
      'id',
      'employeeId',
      'shiftId',
      'locationId',
      'startDate',
      'endDate',
      'workingDays',
      'notes',
      'areaId',
      'slotTimeRange',
    ],
    include: [
      {
        association: 'shift',
        required: false,
        attributes: ['id', 'name', 'startTime', 'endTime'],
      },
      { association: 'location', required: false, attributes: ['id', 'property_name'] },
    ],
  })

  let effectiveNewStart = newStartTime
  let effectiveNewEnd = newEndTime

  if ((!effectiveNewStart || !effectiveNewEnd) && newShiftId) {
    const shift = await Shift.findOne({
      where: { id: newShiftId, isDeleted: false },
      attributes: ['name', 'startTime', 'endTime'],
    })
    if (shift) {
      effectiveNewStart = shift.startTime
      effectiveNewEnd = shift.endTime
    }
  }

  const newIntervals = getWorkIntervals(newStartDate, newEndDate, effectiveNewStart, effectiveNewEnd, newWorkingDays)

  for (const assignment of existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = assignment.toJSON() as any
    const assignmentShift = data.shift
    const existingWindow = resolveEffectiveShiftWindow(
      assignmentShift?.startTime,
      assignmentShift?.endTime,
      data.slotTimeRange,
    )
    const existIntervals = getWorkIntervals(
      data.startDate,
      data.endDate,
      existingWindow.start,
      existingWindow.end,
      data.workingDays,
    )

    for (const newInt of newIntervals) {
      for (const existInt of existIntervals) {
        if (intervalsOverlap(newInt, existInt)) {
          const locationName = data.location?.property_name || 'Unknown Location'
          const shiftName = assignmentShift?.name || 'Unknown Shift'
          const shiftTimes =
            existingWindow.start && existingWindow.end ? ` (${existingWindow.start}-${existingWindow.end})` : ''
          return {
            locationName,
            shiftName,
            startDate: data.startDate,
            endDate: data.endDate,
            shiftTimes,
          }
        }
      }
    }
  }

  return null
}

function normalizeOptionalId(value: unknown): string | null {
  if (value === undefined || value === null || value === 'none' || value === '') return null
  return String(value)
}

function normalizeAreaId(areaId: unknown): string | null {
  return normalizeOptionalId(areaId)
}

function normalizeUnitId(unitId: unknown): string | null {
  return normalizeOptionalId(unitId)
}

export const listEmployeeShifts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    const { employeeId } = req.query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { isDeleted: false, locationId }
    if (employeeId) where.employeeId = employeeId

    const assignments = await ShiftAssignment.findAll({
      where,
      include: [
        {
          association: 'employee',
          attributes: ['id', 'email', 'username'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
        },
        {
          association: 'shift',
          attributes: ['id', 'name', 'startTime', 'endTime'],
        },
        {
          association: 'area',
          attributes: ['id', 'areaName'],
        },
        {
          association: 'block',
          attributes: ['id', 'block_name'],
        },
        {
          association: 'floor',
          attributes: ['id', 'floor_name', 'floor_number'],
        },
        {
          association: 'unit',
          attributes: ['id', 'unit_number'],
        },
      ],
      order: [['startDate', 'ASC']],
    })

    return res.status(200).json(successResponse('Employee shifts fetched', assignments))
  } catch (error) {
    logger.error({ err: error }, 'listEmployeeShifts failed')
    return res.status(500).json(errorResponse('Failed to fetch employee shifts'))
  }
}

export const createEmployeeShift = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    const {
      employeeId,
      shiftId,
      startDate,
      endDate,
      notes,
      workingDays,
      areaId,
      unitId,
      blockId,
      floorId,
      slotTimeRange,
    } = req.body

    if (!employeeId || !shiftId || !startDate || !endDate) {
      return res.status(400).json(errorResponse('Missing required fields'))
    }

    const today = todayYmdLocal()
    if (startDate < today) {
      return res.status(400).json(errorResponse('Start date cannot be in the past'))
    }
    if (endDate < startDate) {
      return res.status(400).json(errorResponse('End date must be on or after start date'))
    }

    const newShift = await Shift.findOne({
      where: { id: shiftId, isDeleted: false },
      attributes: ['name', 'startTime', 'endTime'],
    })
    if (!newShift) {
      return res.status(400).json(errorResponse('Invalid shift ID'))
    }

    const resolvedSlot = typeof slotTimeRange === 'string' && slotTimeRange.trim() ? slotTimeRange.trim() : null

    if (resolvedSlot) {
      if (!parseSlotTimeRange(resolvedSlot)) {
        return res.status(400).json(errorResponse("Invalid slot format. Use 'HH:mm - HH:mm'"))
      }
      if (!isSlotWithinShift(resolvedSlot, newShift.startTime, newShift.endTime)) {
        return res.status(400).json(errorResponse('Selected slot must fall within the shift time window'))
      }
    }

    const effectiveStartTime = resolvedSlot ? resolvedSlot.split('-')[0]!.trim() : newShift.startTime

    if (hasWindowStartPassedOnDate(startDate, effectiveStartTime)) {
      return res
        .status(400)
        .json(
          errorResponse(
            resolvedSlot
              ? 'Selected slot start time has already passed for the start date'
              : 'Selected shift start time has already passed for the start date',
          ),
        )
    }

    const resolvedAreaId = normalizeAreaId(areaId)
    const resolvedBlockId = normalizeOptionalId(blockId)
    const resolvedFloorId = normalizeOptionalId(floorId)
    const resolvedUnitId = normalizeUnitId(unitId)

    if (resolvedAreaId && (resolvedBlockId || resolvedFloorId || resolvedUnitId)) {
      return res.status(400).json(errorResponse('Cannot provide both area and block/floor/unit'))
    }
    if (resolvedUnitId && !resolvedFloorId) {
      return res.status(400).json(errorResponse('floorId is required when unitId is provided'))
    }
    if ((resolvedFloorId || resolvedUnitId) && !resolvedBlockId) {
      return res.status(400).json(errorResponse('blockId is required when floorId or unitId is provided'))
    }

    const conflict = await checkShiftAssignmentOverlap(
      employeeId,
      startDate,
      endDate,
      effectiveStartTime,
      resolvedSlot ? resolvedSlot.split('-')[1]!.trim() : newShift.endTime,
      shiftId,
      undefined,
      workingDays,
      resolvedAreaId,
    )

    if (conflict) {
      return res
        .status(400)
        .json(
          errorResponse(
            `Shift overlaps with existing assignment in ${conflict.locationName} (${conflict.shiftName}${conflict.shiftTimes}) from ${conflict.startDate} to ${conflict.endDate}`,
          ),
        )
    }

    const createdBy = req.user?.id ?? null
    const assignment = await ShiftAssignment.create({
      employeeId,
      shiftId,
      locationId,
      startDate,
      endDate,
      notes,
      workingDays: workingDays || null,
      areaId: resolvedAreaId,
      blockId: resolvedBlockId,
      floorId: resolvedFloorId,
      unitId: resolvedUnitId,
      slotTimeRange: resolvedSlot,
      createdBy,
    })

    try {
      await autoGenerateShiftEmployeeDates(assignment, startDate, endDate, locationId, createdBy)
    } catch (genErr) {
      logger.error({ err: genErr }, 'Failed to auto-generate shift employee dates during creation')
    }

    return res.status(201).json(successResponse('Assignment created', assignment))
  } catch (error) {
    logger.error({ err: error }, 'createEmployeeShift failed')
    return res.status(500).json(errorResponse('Failed to create employee shift'))
  }
}

export const updateEmployeeShift = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const employeeShiftId = asParamString(req.params.employeeShiftId)
    const locationId = asParamString(req.params.locationId)
    const payload = req.body

    const assignment = await ShiftAssignment.findOne({
      where: { id: employeeShiftId, isDeleted: false },
    })
    if (!assignment) {
      return res.status(404).json(errorResponse('Assignment not found'))
    }

    const assignmentData = assignment.toJSON()
    const nextStart = payload.startDate || assignmentData.startDate
    const nextEnd = payload.endDate || assignmentData.endDate
    const nextShift = payload.shiftId || assignmentData.shiftId
    const nextEmp = payload.employeeId || assignmentData.employeeId

    const newShift = await Shift.findOne({
      where: { id: nextShift, isDeleted: false },
      attributes: ['name', 'startTime', 'endTime'],
    })
    if (!newShift) {
      return res.status(400).json(errorResponse('Invalid shift ID'))
    }

    const nextWorkingDays = payload.workingDays !== undefined ? payload.workingDays : assignment.workingDays
    const nextAreaId = payload.areaId !== undefined ? normalizeAreaId(payload.areaId) : assignmentData.areaId
    const nextSlot =
      payload.slotTimeRange !== undefined
        ? typeof payload.slotTimeRange === 'string' && payload.slotTimeRange.trim()
          ? payload.slotTimeRange.trim()
          : null
        : assignmentData.slotTimeRange || null
    const nextWindow = resolveEffectiveShiftWindow(newShift.startTime, newShift.endTime, nextSlot)

    const conflict = await checkShiftAssignmentOverlap(
      nextEmp,
      nextStart,
      nextEnd,
      nextWindow.start,
      nextWindow.end,
      nextShift,
      employeeShiftId,
      nextWorkingDays,
      nextAreaId,
    )

    if (conflict) {
      return res
        .status(400)
        .json(
          errorResponse(
            `Shift overlaps with existing assignment in ${conflict.locationName} (${conflict.shiftName}${conflict.shiftTimes}) from ${conflict.startDate} to ${conflict.endDate}`,
          ),
        )
    }

    const updatedBy = req.user?.id ?? null
    const oldAreaId = assignmentData.areaId

    const updatePayload = { ...payload }
    if (payload.areaId !== undefined) {
      updatePayload.areaId = nextAreaId
    }

    await assignment.update({ ...updatePayload, locationId, updatedBy })

    try {
      const datesToDelete = await ShiftDate.findAll({
        where: {
          employeeShiftAssignmentId: employeeShiftId,
          [Op.or]: [{ date: { [Op.lt]: nextStart } }, { date: { [Op.gt]: nextEnd } }],
          isDeleted: false,
        },
        attributes: ['id'],
      })

      if (datesToDelete.length > 0) {
        const dateIds = datesToDelete.map((d) => d.id)
        await ShiftResidentPool.update(
          { isDeleted: true },
          { where: { shiftEmployeeDateId: { [Op.in]: dateIds }, isDeleted: false } },
        )
        await ShiftDate.update({ isDeleted: true }, { where: { id: { [Op.in]: dateIds } } })
      }
    } catch (cleanErr) {
      logger.error({ err: cleanErr }, 'Failed to clean up out-of-range shift dates on update')
    }

    try {
      await autoGenerateShiftEmployeeDates(assignment, nextStart, nextEnd, locationId, updatedBy)
    } catch (genErr) {
      logger.error({ err: genErr }, 'Failed to auto-generate shift dates on update')
    }

    try {
      const activeDatesToSync = await ShiftDate.findAll({
        where: {
          employeeShiftAssignmentId: employeeShiftId,
          date: { [Op.between]: [nextStart, nextEnd] },
          isDeleted: false,
          status: {
            [Op.in]: [ShiftEmployeeDateStatus.UPCOMING, ShiftEmployeeDateStatus.DAY_OFF],
          },
        },
      })

      for (const activeDate of activeDatesToSync) {
        const isWorking = assignment.isWorkingOn(activeDate.date)
        const targetStatus = isWorking ? ShiftEmployeeDateStatus.UPCOMING : ShiftEmployeeDateStatus.DAY_OFF
        const targetLeave = isWorking ? null : 'week_off'
        const areaVal = payload.areaId !== undefined ? nextAreaId : activeDate.areaId

        if (activeDate.status !== targetStatus || activeDate.areaId !== areaVal) {
          await activeDate.update({
            status: targetStatus,
            leaveType: targetLeave,
            areaId: isWorking ? (areaVal ?? null) : null,
            updatedBy,
          })

          if (!isWorking) {
            await ShiftResidentPool.update(
              { isDeleted: true },
              { where: { shiftEmployeeDateId: activeDate.id, isDeleted: false } },
            )
          }
        }
      }
    } catch (syncErr) {
      logger.error({ err: syncErr }, 'Failed to synchronize active shift dates on update')
    }

    const areaChanged = payload.areaId !== undefined && nextAreaId !== oldAreaId
    if (areaChanged) {
      syncShiftDatesOnAreaChange(employeeShiftId, nextAreaId ?? null, locationId, updatedBy).catch((err) =>
        logger.error({ err }, 'syncShiftDatesOnAreaChange failed'),
      )
    }

    return res.status(200).json(successResponse('Assignment updated', assignment))
  } catch (error) {
    logger.error({ err: error }, 'updateEmployeeShift failed')
    return res.status(500).json(errorResponse('Failed to update employee shift'))
  }
}

export const deleteEmployeeShift = async (req: AuthenticatedRequest, res: Response) => {
  const transaction = await ShiftAssignment.sequelize!.transaction()
  try {
    const employeeShiftId = asParamString(req.params.employeeShiftId)
    const assignment = await ShiftAssignment.findOne({
      where: { id: employeeShiftId, isDeleted: false },
      transaction,
    })
    if (!assignment) {
      await transaction.rollback()
      return res.status(404).json(errorResponse('Assignment not found'))
    }

    await assignment.update({ isDeleted: true }, { transaction })

    const datesToDelete = await ShiftDate.findAll({
      where: { employeeShiftAssignmentId: employeeShiftId, isDeleted: false },
      attributes: ['id'],
      transaction,
    })

    if (datesToDelete.length > 0) {
      const dateIds = datesToDelete.map((d) => d.id)
      await ShiftResidentPool.update(
        { isDeleted: true, isActive: false, updatedBy: req.user?.id ?? null },
        {
          where: { shiftEmployeeDateId: { [Op.in]: dateIds }, isDeleted: false },
          transaction,
        },
      )
      await ShiftDate.update(
        { isDeleted: true, isActive: false, updatedBy: req.user?.id ?? null },
        { where: { id: { [Op.in]: dateIds } }, transaction },
      )
    }

    await transaction.commit()
    return res.status(200).json(successResponse('Assignment deleted'))
  } catch (error) {
    await transaction.rollback()
    logger.error({ err: error }, 'deleteEmployeeShift failed')
    return res.status(500).json(errorResponse('Failed to delete employee shift'))
  }
}

export const bulkCreateEmployeeShifts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    const {
      employeeIds,
      shiftId,
      startDate,
      endDate,
      notes,
      workingDays,
      areaId,
      areaIds,
      unitId,
      blockId,
      floorId,
      slotTimeRange,
    } = req.body

    if (!Array.isArray(employeeIds) || employeeIds.length === 0 || !shiftId || !startDate || !endDate) {
      return res.status(400).json(errorResponse('Missing required fields or invalid employeeIds'))
    }

    const newShift = await Shift.findOne({
      where: { id: shiftId, isDeleted: false },
      attributes: ['name', 'startTime', 'endTime'],
    })
    if (!newShift) {
      return res.status(400).json(errorResponse('Invalid shift ID'))
    }

    const bulkSlot = typeof slotTimeRange === 'string' && slotTimeRange.trim() ? slotTimeRange.trim() : null
    const bulkWindow = resolveEffectiveShiftWindow(newShift.startTime, newShift.endTime, bulkSlot)

    const resolvedBlockId = normalizeOptionalId(blockId)
    const resolvedFloorId = normalizeOptionalId(floorId)
    const resolvedUnitId = normalizeUnitId(unitId)
    let areaIdsList: (string | null)[] = [null]
    if (Array.isArray(areaIds) && areaIds.length > 0) {
      areaIdsList = areaIds.map((id: string) => normalizeAreaId(id))
    } else if (areaId && areaId !== 'none') {
      areaIdsList = [normalizeAreaId(areaId)]
    }

    if (areaIdsList.some((id) => id) && (resolvedBlockId || resolvedFloorId || resolvedUnitId)) {
      return res.status(400).json(errorResponse('Cannot provide both area and block/floor/unit'))
    }
    if (resolvedUnitId && !resolvedFloorId) {
      return res.status(400).json(errorResponse('floorId is required when unitId is provided'))
    }
    if ((resolvedFloorId || resolvedUnitId) && !resolvedBlockId) {
      return res.status(400).json(errorResponse('blockId is required when floorId or unitId is provided'))
    }
    if (resolvedBlockId || resolvedFloorId || resolvedUnitId) {
      areaIdsList = [null]
    }

    const employees = await User.findAll({
      where: { id: { [Op.in]: employeeIds } },
      attributes: ['id', 'email', 'username'],
      include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const employeeMap = employees.reduce((acc: Record<string, string>, emp: any) => {
      const profile = emp.profile || {}
      acc[String(emp.id)] =
        `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || emp.email || emp.username || 'Unknown'
      return acc
    }, {})

    const conflicts: string[] = []

    for (const employeeId of employeeIds) {
      for (const aId of areaIdsList) {
        const conflict = await checkShiftAssignmentOverlap(
          employeeId,
          startDate,
          endDate,
          bulkWindow.start,
          bulkWindow.end,
          shiftId,
          undefined,
          workingDays,
          aId,
        )
        if (conflict) {
          const name = employeeMap[String(employeeId)] || 'Unknown Employee'
          conflicts.push(
            `${name}: Overlaps in ${conflict.locationName} (${conflict.shiftName}${conflict.shiftTimes}) from ${conflict.startDate} to ${conflict.endDate}`,
          )
        }
      }
    }

    if (conflicts.length > 0) {
      return res.status(400).json(errorResponse('Conflicting assignments found', { conflicts }))
    }

    const createdBy = req.user?.id ?? null
    const assignmentData = []
    for (const employeeId of employeeIds) {
      for (const aId of areaIdsList) {
        assignmentData.push({
          employeeId,
          shiftId,
          locationId,
          startDate,
          endDate,
          notes: notes || null,
          workingDays: workingDays || null,
          areaId: aId,
          blockId: resolvedBlockId,
          floorId: resolvedFloorId,
          unitId: resolvedUnitId,
          slotTimeRange: bulkSlot,
          createdBy,
        })
      }
    }

    const assignments = await ShiftAssignment.bulkCreate(assignmentData)

    try {
      for (const assignment of assignments) {
        await autoGenerateShiftEmployeeDates(assignment, startDate, endDate, locationId, createdBy)
      }
    } catch (genErr) {
      logger.error({ err: genErr }, 'Failed to auto-generate shift employee dates during bulk creation')
    }

    return res.status(201).json(successResponse(`${assignments.length} assignments created`, assignments))
  } catch (error) {
    logger.error({ err: error }, 'bulkCreateEmployeeShifts failed')
    return res.status(500).json(errorResponse('Failed to bulk create employee shifts'))
  }
}

export const exportEmployeeShifts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    const { employeeId, startDate, endDate } = req.query

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { isDeleted: false, locationId }
    if (employeeId) where.employeeId = employeeId

    if (startDate || endDate) {
      where[Op.and] = []
      if (startDate) where[Op.and].push({ endDate: { [Op.gte]: startDate } })
      if (endDate) where[Op.and].push({ startDate: { [Op.lte]: endDate } })
    }

    const assignments = await ShiftAssignment.findAll({
      where,
      include: [
        {
          association: 'employee',
          attributes: ['id', 'email', 'username'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
        },
        {
          association: 'shift',
          attributes: ['id', 'name', 'startTime', 'endTime'],
        },
      ],
      order: [['startDate', 'ASC']],
    })

    const rows = assignments.map((assignment) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = assignment.toJSON() as any
      const employee = data.employee || {}
      const profile = employee.profile || {}
      const shift = data.shift || {}
      return {
        'Employee Name': `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || employee.email || 'N/A',
        'Employee Email': employee.email || 'N/A',
        'Shift Name': shift.name || 'N/A',
        'Shift Time': shift.startTime && shift.endTime ? `${shift.startTime} - ${shift.endTime}` : 'N/A',
        'Start Date': data.startDate || 'N/A',
        'End Date': data.endDate || 'N/A',
        Notes: data.notes || 'N/A',
        'Created At': data.createdAt ? new Date(data.createdAt).toLocaleString() : 'N/A',
      }
    })

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Medical Shifts')

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    const filename = `medical_shifts_${Date.now()}.xlsx`

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    return res.send(buffer)
  } catch (error) {
    logger.error({ err: error }, 'exportEmployeeShifts failed')
    return res.status(500).json(errorResponse('Failed to export employee shifts'))
  }
}

// ── Shift employee dates ──────────────────────────────────────────────────────
export async function autoGenerateShiftEmployeeDates(
  assignment: ShiftAssignment,
  fromDate: string,
  toDate: string,
  locationId: string,
  createdBy?: string | null,
) {
  const actorId = createdBy ?? null
  const employeeShiftAssignmentId = assignment.id
  const assignmentStart = assignment.startDate
  const assignmentEnd = assignment.endDate

  const effectiveFrom = fromDate >= assignmentStart ? fromDate : assignmentStart
  const effectiveTo = toDate <= assignmentEnd ? toDate : assignmentEnd

  if (effectiveFrom > effectiveTo) {
    return { created: [] as string[], skipped: [] as string[], dayOff: [] as string[] }
  }

  const existing = await ShiftDate.findAll({
    where: {
      employeeShiftAssignmentId,
      date: { [Op.between]: [effectiveFrom, effectiveTo] },
    },
    attributes: ['id', 'date', 'isDeleted'],
    raw: true,
  })

  const activeDates = new Set<string>()
  const deletedMap = new Map<string, { id: string; date: string }>()

  for (const r of existing as Array<{ id: string; date: string; isDeleted: boolean }>) {
    if (r.isDeleted) deletedMap.set(r.date, r)
    else activeDates.add(r.date)
  }

  const created: string[] = []
  const skipped: string[] = []
  const dayOff: string[] = []
  const areaId = assignment.areaId

  for (const date of eachDay(effectiveFrom, effectiveTo)) {
    if (activeDates.has(date)) {
      skipped.push(date)
      continue
    }

    const working = assignment.isWorkingOn(date)
    const status = working ? ShiftEmployeeDateStatus.UPCOMING : ShiftEmployeeDateStatus.DAY_OFF
    const leaveType: LeaveType | null = working ? null : 'week_off'

    const deletedRecord = deletedMap.get(date)

    if (deletedRecord) {
      const restored = await ShiftDate.findOne({ where: { id: deletedRecord.id } })
      if (restored) {
        await restored.update({
          isDeleted: false,
          isActive: true,
          status,
          leaveType,
          areaId: working ? areaId : null,
          updatedBy: actorId,
        })
      }
    } else {
      await ShiftDate.create({
        employeeShiftAssignmentId,
        date,
        status,
        leaveType,
        areaId: working ? areaId : null,
        locationId,
        createdBy: actorId,
        updatedBy: actorId,
      })
    }

    if (working) {
      created.push(date)
    } else {
      dayOff.push(date)
    }
  }

  logger.info(
    {
      assignmentId: employeeShiftAssignmentId,
      fromDate,
      toDate,
      created: created.length,
      dayOff: dayOff.length,
      skipped: skipped.length,
      initiatedBy: actorId,
    },
    'Auto-generated shift employee dates',
  )

  return { created, skipped, dayOff }
}

export async function syncShiftDatesOnAreaChange(
  assignmentId: string,
  newAreaId: string | null,
  locationId: string,
  updatedBy?: string | null,
): Promise<void> {
  const actorId = updatedBy ?? null
  const todayStr = new Date().toISOString().split('T')[0]

  const futureDates = await ShiftDate.findAll({
    where: {
      employeeShiftAssignmentId: assignmentId,
      date: { [Op.gte]: todayStr },
      isDeleted: false,
    },
    attributes: ['id', 'status'],
  })

  for (const sd of futureDates) {
    const isWorking = sd.status !== ShiftEmployeeDateStatus.DAY_OFF && sd.status !== ShiftEmployeeDateStatus.ABSENT

    await ShiftDate.update({ areaId: isWorking ? newAreaId : null, updatedBy: actorId }, { where: { id: sd.id } })

    await ShiftResidentPool.update(
      { isDeleted: true, isActive: false, updatedBy: actorId },
      { where: { shiftEmployeeDateId: sd.id, locationId, isDeleted: false } },
    )
  }

  logger.info(
    {
      assignmentId,
      newAreaId,
      affectedDates: futureDates.length,
      initiatedBy: actorId,
    },
    'syncShiftDatesOnAreaChange',
  )
}

const isDoctorRole = (r?: string) => {
  const lower = (r || '').toLowerCase()
  return lower.includes('doctor') || lower.includes('dr')
}
const isNurseRole = (r?: string) => (r || '').toLowerCase().includes('nurse')
const isCaretakerRole = (r?: string) => (r || '').toLowerCase().includes('caretaker')

const isSameRoleGroup = (roleA?: string, roleB?: string) => {
  if (!roleA || !roleB) return true
  if (isDoctorRole(roleA) && isDoctorRole(roleB)) return true
  if (isNurseRole(roleA) && isNurseRole(roleB)) return true
  if (isCaretakerRole(roleA) && isCaretakerRole(roleB)) return true
  return roleA.toLowerCase().trim() === roleB.toLowerCase().trim()
}

async function getUserRoleCode(userId: string, locationId?: string): Promise<string | undefined> {
  const where: Record<string, unknown> = { userId, isDeleted: false, isActive: true }
  if (locationId) where.locId = locationId
  const ul = await UserLocation.findOne({
    where,
    include: [{ model: Role, as: 'role', attributes: ['code', 'name'] }],
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (ul as any)?.role
  return (role?.code || role?.name) as string | undefined
}

function resolveDateWindow(assignment: {
  slotTimeRange?: string | null
  shift?: { startTime?: string; endTime?: string } | null
}): { start: string; end: string } | null {
  if (assignment.slotTimeRange && String(assignment.slotTimeRange).trim()) {
    const parts = String(assignment.slotTimeRange)
      .split('-')
      .map((p) => p.trim())
    if (parts.length === 2 && parts[0] && parts[1]) {
      return { start: parts[0], end: parts[1] }
    }
  }
  if (assignment.shift?.startTime && assignment.shift?.endTime) {
    return { start: assignment.shift.startTime, end: assignment.shift.endTime }
  }
  return null
}

/**
 * Persist upcoming/on_duty → on_duty/completed from date + shift/slot end time.
 * Covered, day_off, and absent rows are left unchanged.
 */
async function syncShiftDateLifecycleStatuses(locationId: string, now = new Date()) {
  const rows = await ShiftDate.findAll({
    where: {
      locationId,
      isDeleted: false,
      status: {
        [Op.in]: [ShiftEmployeeDateStatus.UPCOMING, ShiftEmployeeDateStatus.ON_DUTY],
      },
    },
    include: [
      {
        model: ShiftAssignment,
        as: 'shiftAssignment',
        required: true,
        attributes: ['id', 'slotTimeRange'],
        include: [
          {
            model: Shift,
            as: 'shift',
            attributes: ['id', 'startTime', 'endTime'],
          },
        ],
      },
    ],
  })

  const idsByStatus: Record<string, string[]> = {
    [ShiftEmployeeDateStatus.UPCOMING]: [],
    [ShiftEmployeeDateStatus.ON_DUTY]: [],
    [ShiftEmployeeDateStatus.COMPLETED]: [],
  }

  for (const row of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = row.toJSON() as any
    const window = resolveDateWindow({
      slotTimeRange: data.shiftAssignment?.slotTimeRange,
      shift: data.shiftAssignment?.shift,
    })
    const next = resolveLifecycleRosterStatus(data.status, data.date, window?.start, window?.end, now)
    if (next !== data.status && idsByStatus[next]) {
      idsByStatus[next].push(data.id)
    }
  }

  await Promise.all(
    Object.entries(idsByStatus).map(([status, ids]) => {
      if (ids.length === 0) return Promise.resolve()
      return ShiftDate.update(
        { status: status as ShiftEmployeeDateStatus },
        { where: { id: { [Op.in]: ids }, locationId } },
      )
    }),
  )
}

/**
 * Returns true when employee already has overlapping active duty on the given date/slot.
 */
async function isEmployeeBusyOnDateSlot(params: {
  employeeId: string
  date: string
  locationId: string
  window: { start: string; end: string }
  excludeDateIds?: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction?: any
}): Promise<boolean> {
  const { employeeId, date, locationId, window, excludeDateIds = [], transaction } = params

  const dates = await ShiftDate.findAll({
    where: {
      locationId,
      date,
      isDeleted: false,
      status: { [Op.ne]: ShiftEmployeeDateStatus.DAY_OFF },
      ...(excludeDateIds.length > 0 ? { id: { [Op.notIn]: excludeDateIds } } : {}),
    },
    include: [
      {
        model: ShiftAssignment,
        as: 'shiftAssignment',
        required: true,
        include: [
          {
            model: Shift,
            as: 'shift',
            attributes: ['id', 'name', 'startTime', 'endTime'],
          },
        ],
      },
    ],
    transaction,
  })

  for (const row of dates) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = row.toJSON() as any
    const assignedEmpId = data.shiftAssignment?.employeeId as string | undefined
    const isCovering = data.status === ShiftEmployeeDateStatus.COVERED && data.coveredByEmployeeId === employeeId
    const isOwnActiveDuty =
      assignedEmpId === employeeId &&
      data.status !== ShiftEmployeeDateStatus.COVERED &&
      data.status !== ShiftEmployeeDateStatus.DAY_OFF

    if (!isCovering && !isOwnActiveDuty) continue

    const existingWindow = resolveDateWindow({
      slotTimeRange: data.shiftAssignment?.slotTimeRange,
      shift: data.shiftAssignment?.shift,
    })
    if (!existingWindow) continue

    if (
      doSlotRangesOverlap(
        { start: window.start, end: window.end },
        { start: existingWindow.start, end: existingWindow.end },
      )
    ) {
      return true
    }
  }

  return false
}

export const createShiftEmployeeDate = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    const { employeeShiftAssignmentId, date, status } = req.body
    const createdBy = req.user?.id ?? null

    if (!employeeShiftAssignmentId || !date) {
      return res.status(400).json(errorResponse('Missing employeeShiftAssignmentId or date'))
    }

    const assignment = await ShiftAssignment.findOne({
      where: { id: employeeShiftAssignmentId, locationId, isDeleted: false },
    })

    if (!assignment) {
      return res.status(404).json(errorResponse('Employee shift assignment not found at this location'))
    }

    if (!assignment.isWorkingOn(date)) {
      return res
        .status(400)
        .json(
          errorResponse(
            `Employee is not scheduled to work on ${date}` +
              (assignment.workingDays ? ` (working days: ${assignment.workingDays.join(', ')})` : ''),
          ),
        )
    }

    const existing = await ShiftDate.findOne({
      where: { employeeShiftAssignmentId, date, isDeleted: false },
    })
    if (existing) {
      return res.status(400).json(errorResponse('Shift employee date already exists for this assignment and date'))
    }

    const areaId = assignment.areaId
    const shiftDate = await ShiftDate.create({
      employeeShiftAssignmentId,
      date,
      status: status || ShiftEmployeeDateStatus.UPCOMING,
      areaId,
      locationId,
      createdBy,
      updatedBy: createdBy,
    })

    return res.status(201).json(successResponse('Shift employee date created', shiftDate))
  } catch (error) {
    logger.error({ err: error }, 'createShiftEmployeeDate failed')
    return res.status(500).json(errorResponse('Failed to create shift employee date'))
  }
}

export const generateShiftEmployeeDates = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    const { employeeShiftAssignmentId, fromDate, toDate } = req.body
    const createdBy = req.user?.id ?? null

    if (!employeeShiftAssignmentId || !fromDate || !toDate) {
      return res.status(400).json(errorResponse('Missing employeeShiftAssignmentId, fromDate, or toDate'))
    }

    const assignment = await ShiftAssignment.findOne({
      where: { id: employeeShiftAssignmentId, locationId, isDeleted: false },
    })
    if (!assignment) {
      return res.status(404).json(errorResponse('Employee shift assignment not found'))
    }

    const { created, skipped, dayOff } = await autoGenerateShiftEmployeeDates(
      assignment,
      fromDate,
      toDate,
      locationId,
      createdBy,
    )

    return res.status(201).json(
      successResponse('Shift employee dates generated', {
        created: created.length,
        dayOff: dayOff.length,
        skipped: skipped.length,
        dates: { created, dayOff, skipped },
      }),
    )
  } catch (error) {
    logger.error({ err: error }, 'generateShiftEmployeeDates failed')
    return res.status(500).json(errorResponse('Failed to generate shift employee dates'))
  }
}

export const listShiftEmployeeDates = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    const { assignmentId, date, status, includeDeleted } = req.query

    // Advance time-based statuses before filtering so completed rows match status queries.
    await syncShiftDateLifecycleStatuses(locationId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { locationId }
    if (includeDeleted !== 'true') where.isDeleted = false
    if (assignmentId) where.employeeShiftAssignmentId = assignmentId
    if (date) where.date = date
    if (status) where.status = status

    const shiftDates = await ShiftDate.findAll({
      where,
      include: [
        {
          model: ShiftAssignment,
          as: 'shiftAssignment',
          required: true,
          include: [
            {
              model: User,
              as: 'employee',
              where: { isActive: true, isDeleted: false },
              attributes: ['id', 'email', 'username', 'isActive'],
              include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
            },
            {
              model: Shift,
              as: 'shift',
              attributes: ['id', 'name', 'startTime', 'endTime'],
            },
            {
              association: 'area',
              attributes: ['id', 'areaName'],
            },
            {
              association: 'block',
              attributes: ['id', 'block_name'],
            },
            {
              association: 'floor',
              attributes: ['id', 'floor_name', 'floor_number'],
            },
            {
              association: 'unit',
              attributes: ['id', 'unit_number'],
            },
          ],
        },
        {
          model: User,
          as: 'coveringEmployee',
          attributes: ['id', 'email', 'username'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
        },
        {
          model: ShiftArea,
          as: 'area',
          attributes: ['id', 'areaName'],
        },
      ],
      order: [['date', 'ASC']],
    })

    return res.status(200).json(successResponse('Shift employee dates fetched', shiftDates))
  } catch (error) {
    logger.error({ err: error }, 'listShiftEmployeeDates failed')
    return res.status(500).json(errorResponse('Failed to fetch shift employee dates'))
  }
}

export const markDayOff = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dateId = asParamString(req.params.dateId)
    const locationId = asParamString(req.params.locationId)
    const { leaveType, leaveNote } = req.body
    const updatedBy = req.user?.id ?? null

    if (leaveType && !LEAVE_TYPES.includes(leaveType as LeaveType)) {
      return res.status(400).json(errorResponse(`Invalid leaveType. Must be one of: ${LEAVE_TYPES.join(', ')}`))
    }

    const shiftDate = await ShiftDate.findOne({
      where: { id: dateId, locationId, isDeleted: false },
    })
    if (!shiftDate) {
      return res.status(404).json(errorResponse('Shift employee date not found'))
    }

    await shiftDate.update({
      status: ShiftEmployeeDateStatus.DAY_OFF,
      leaveType: (leaveType as LeaveType) || 'casual',
      leaveNote: leaveNote || null,
      markedBy: updatedBy,
      markedAt: new Date(),
      updatedBy,
    })

    return res.status(200).json(successResponse('Day marked as day off', shiftDate))
  } catch (error) {
    logger.error({ err: error }, 'markDayOff failed')
    return res.status(500).json(errorResponse('Failed to mark day off'))
  }
}

export const unmarkDayOff = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dateId = asParamString(req.params.dateId)
    const locationId = asParamString(req.params.locationId)
    const updatedBy = req.user?.id ?? null

    const shiftDate = await ShiftDate.findOne({
      where: { id: dateId, locationId, isDeleted: false },
    })
    if (!shiftDate) {
      return res.status(404).json(errorResponse('Shift employee date not found'))
    }

    if (shiftDate.status !== ShiftEmployeeDateStatus.DAY_OFF) {
      return res.status(400).json(errorResponse('This shift date is not currently marked as day off'))
    }

    await shiftDate.update({
      status: ShiftEmployeeDateStatus.UPCOMING,
      leaveType: null,
      leaveNote: null,
      markedBy: null,
      markedAt: null,
      updatedBy,
    })

    return res.status(200).json(successResponse('Day off removed; status restored to upcoming', shiftDate))
  } catch (error) {
    logger.error({ err: error }, 'unmarkDayOff failed')
    return res.status(500).json(errorResponse('Failed to unmark day off'))
  }
}

export const coverShiftEmployeeDate = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dateId = asParamString(req.params.dateId)
    const locationId = asParamString(req.params.locationId)
    const { coveredByEmployeeId, notes } = req.body
    const updatedBy = req.user?.id ?? null

    if (!coveredByEmployeeId) {
      return res.status(400).json(errorResponse('Missing coveredByEmployeeId'))
    }

    const shiftDate = await ShiftDate.findOne({
      where: { id: dateId, locationId, isDeleted: false },
      include: [
        {
          model: ShiftAssignment,
          as: 'shiftAssignment',
          include: [
            { model: User, as: 'employee', attributes: ['id'] },
            {
              model: Shift,
              as: 'shift',
              attributes: ['id', 'name', 'startTime', 'endTime'],
            },
          ],
        },
      ],
    })

    if (!shiftDate) {
      return res.status(404).json(errorResponse('Shift employee date not found'))
    }

    const coveringUser = await User.findOne({
      where: { id: coveredByEmployeeId, isActive: true, isDeleted: false },
    })
    if (!coveringUser) {
      return res.status(404).json(errorResponse('Covering employee not found or inactive'))
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalEmployeeId = (shiftDate as any).shiftAssignment?.employeeId as string | undefined
    const originalRole = originalEmployeeId ? await getUserRoleCode(originalEmployeeId, locationId) : undefined
    const coveringRole = await getUserRoleCode(coveredByEmployeeId, locationId)

    if (originalRole && coveringRole && !isSameRoleGroup(coveringRole, originalRole)) {
      return res
        .status(400)
        .json(
          errorResponse(
            `Role mismatch: A shift assigned to a '${originalRole}' can only be covered by an employee with a matching role.`,
          ),
        )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assignment = (shiftDate as any).shiftAssignment
    const coverWindow = resolveDateWindow({
      slotTimeRange: assignment?.slotTimeRange,
      shift: assignment?.shift,
    })
    if (coverWindow) {
      const busy = await isEmployeeBusyOnDateSlot({
        employeeId: coveredByEmployeeId,
        date: shiftDate.date,
        locationId,
        window: coverWindow,
        excludeDateIds: [dateId],
      })
      if (busy) {
        return res
          .status(400)
          .json(
            errorResponse(
              'Selected employee is not available for this day and time slot. Choose someone without an overlapping roster.',
            ),
          )
      }
    }

    await shiftDate.update({
      coveredByEmployeeId,
      status: ShiftEmployeeDateStatus.COVERED,
      notes,
      markedBy: updatedBy,
      markedAt: new Date(),
      updatedBy,
    })

    return res.status(200).json(successResponse('Shift employee date coverage updated', shiftDate))
  } catch (error) {
    logger.error({ err: error }, 'coverShiftEmployeeDate failed')
    return res.status(500).json(errorResponse('Failed to update coverage'))
  }
}

export const swapShiftEmployeeDates = async (req: AuthenticatedRequest, res: Response) => {
  const transaction = await sequelize.transaction()
  try {
    const locationId = asParamString(req.params.locationId)
    const dateId = asParamString(req.params.dateId)
    const { targetDateId, notes } = req.body
    const updatedBy = req.user?.id ?? null

    if (!targetDateId) {
      await transaction.rollback()
      return res.status(400).json(errorResponse('Missing targetDateId'))
    }

    const source = await ShiftDate.findOne({
      where: { id: dateId, locationId, isDeleted: false },
      include: [
        {
          model: ShiftAssignment,
          as: 'shiftAssignment',
          include: [
            {
              model: Shift,
              as: 'shift',
              attributes: ['id', 'name', 'startTime', 'endTime'],
            },
          ],
        },
      ],
      transaction,
    })

    const target = await ShiftDate.findOne({
      where: { id: targetDateId, locationId, isDeleted: false },
      include: [
        {
          model: ShiftAssignment,
          as: 'shiftAssignment',
          include: [
            {
              model: Shift,
              as: 'shift',
              attributes: ['id', 'name', 'startTime', 'endTime'],
            },
          ],
        },
      ],
      transaction,
    })

    if (!source || !target) {
      await transaction.rollback()
      return res.status(404).json(errorResponse('One or both shift employee dates not found'))
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sourceEmpId = (source as any).shiftAssignment?.employeeId as string | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const targetEmpId = (target as any).shiftAssignment?.employeeId as string | undefined

    if (!sourceEmpId || !targetEmpId) {
      await transaction.rollback()
      return res.status(400).json(errorResponse('Invalid shift assignments for swapping'))
    }

    if (sourceEmpId === targetEmpId) {
      await transaction.rollback()
      return res.status(400).json(errorResponse('Swap requires selecting another employee’s shift date'))
    }

    const sourceRole = await getUserRoleCode(sourceEmpId, locationId)
    const targetRole = await getUserRoleCode(targetEmpId, locationId)

    if (!isSameRoleGroup(sourceRole, targetRole)) {
      await transaction.rollback()
      return res
        .status(400)
        .json(
          errorResponse(
            'Shift swap is only permitted between employees of the same professional role group (e.g. Doctor with Doctor, Nurse with Nurse).',
          ),
        )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sourceAssignment = (source as any).shiftAssignment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const targetAssignment = (target as any).shiftAssignment
    const sourceWindow = resolveDateWindow({
      slotTimeRange: sourceAssignment?.slotTimeRange,
      shift: sourceAssignment?.shift,
    })
    const targetWindow = resolveDateWindow({
      slotTimeRange: targetAssignment?.slotTimeRange,
      shift: targetAssignment?.shift,
    })

    if (sourceWindow) {
      const targetBusyOnSource = await isEmployeeBusyOnDateSlot({
        employeeId: targetEmpId,
        date: source.date,
        locationId,
        window: sourceWindow,
        excludeDateIds: [source.id, target.id],
        transaction,
      })
      if (targetBusyOnSource) {
        await transaction.rollback()
        return res
          .status(400)
          .json(
            errorResponse(
              'Selected employee is not available for this day and time slot. Choose a swap target without overlapping duty.',
            ),
          )
      }
    }

    if (targetWindow) {
      const sourceBusyOnTarget = await isEmployeeBusyOnDateSlot({
        employeeId: sourceEmpId,
        date: target.date,
        locationId,
        window: targetWindow,
        excludeDateIds: [source.id, target.id],
        transaction,
      })
      if (sourceBusyOnTarget) {
        await transaction.rollback()
        return res
          .status(400)
          .json(errorResponse('Current employee is not available for the selected swap day and time slot.'))
      }
    }

    const swapNote = typeof notes === 'string' && notes.trim() ? notes.trim() : null

    await source.update(
      {
        coveredByEmployeeId: targetEmpId,
        status: ShiftEmployeeDateStatus.COVERED,
        notes: swapNote,
        markedBy: updatedBy,
        markedAt: new Date(),
        updatedBy,
      },
      { transaction },
    )

    await target.update(
      {
        coveredByEmployeeId: sourceEmpId,
        status: ShiftEmployeeDateStatus.COVERED,
        notes: swapNote,
        markedBy: updatedBy,
        markedAt: new Date(),
        updatedBy,
      },
      { transaction },
    )

    await transaction.commit()

    return res.status(200).json(
      successResponse('Shift employee dates swapped successfully', {
        source,
        target,
      }),
    )
  } catch (error) {
    await transaction.rollback()
    logger.error({ err: error }, 'swapShiftEmployeeDates failed')
    return res.status(500).json(errorResponse('Failed to swap shift employee dates'))
  }
}

// ── Shift resident pool ───────────────────────────────────────────────────────
const OCCUPIED_STATUSES = [OccupancyStatus.OWNER_OCCUPIED, OccupancyStatus.TENANT_OCCUPIED]

export const createShiftResidentPool = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    const { shiftEmployeeDateId, unitId, fromTime, toTime, notes } = req.body
    const createdBy = req.user?.id ?? null

    if (!shiftEmployeeDateId || !unitId) {
      return res.status(400).json(errorResponse('Missing shiftEmployeeDateId or unitId'))
    }

    const shiftDate = await ShiftDate.findOne({
      where: { id: shiftEmployeeDateId, locationId, isDeleted: false },
    })
    if (!shiftDate) {
      return res.status(404).json(errorResponse('Shift employee date not found'))
    }

    const unit = await PropertyUnit.findOne({
      where: {
        id: unitId,
        isDeleted: false,
        occupancyStatus: { [Op.in]: OCCUPIED_STATUSES },
      },
      include: [
        {
          model: PropertyFloor,
          as: 'floor',
          required: true,
          where: { isDeleted: false },
          include: [
            {
              model: PropertyBlock,
              as: 'block',
              required: true,
              where: { propertyId: locationId, isDeleted: false },
            },
          ],
        },
      ],
    })
    if (!unit) {
      return res.status(404).json(errorResponse('Occupied flat not found at this location'))
    }

    const existing = await ShiftResidentPool.findOne({
      where: { shiftEmployeeDateId, unitId, isDeleted: false },
    })
    if (existing) {
      return res.status(400).json(errorResponse('Flat already assigned to this shift date'))
    }

    const poolEntry = await ShiftResidentPool.create({
      shiftEmployeeDateId,
      unitId,
      fromTime,
      toTime,
      notes,
      locationId,
      createdBy,
      updatedBy: createdBy,
    })

    return res.status(201).json(successResponse('Flat added to shift pool', poolEntry))
  } catch (error) {
    logger.error({ err: error }, 'createShiftResidentPool failed')
    return res.status(500).json(errorResponse('Failed to add flat to shift pool'))
  }
}

export const listShiftResidentPool = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    const { shiftEmployeeDateId, unitId, date } = req.query

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { locationId, isDeleted: false }
    if (shiftEmployeeDateId) where.shiftEmployeeDateId = shiftEmployeeDateId
    if (unitId) where.unitId = unitId

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dateWhere: any = { isDeleted: false }
    if (date) dateWhere.date = date

    const poolEntries = await ShiftResidentPool.findAll({
      where,
      include: [
        {
          model: PropertyUnit,
          as: 'unit',
          attributes: ['id', 'unit_number', 'occupancyStatus'],
          include: [
            {
              model: PropertyFloor,
              as: 'floor',
              attributes: ['id', 'floor_name', 'floor_number'],
              include: [
                {
                  model: PropertyBlock,
                  as: 'block',
                  attributes: ['id', 'block_name'],
                },
              ],
            },
          ],
        },
        {
          model: ShiftDate,
          as: 'shiftEmployeeDate',
          where: dateWhere,
          required: true,
          include: [
            {
              model: ShiftAssignment,
              as: 'shiftAssignment',
              include: [
                {
                  model: User,
                  as: 'employee',
                  attributes: ['id', 'email', 'username'],
                  include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
                },
                {
                  model: Shift,
                  as: 'shift',
                  attributes: ['id', 'name', 'startTime', 'endTime'],
                },
              ],
            },
            {
              model: User,
              as: 'coveringEmployee',
              attributes: ['id', 'email', 'username'],
              include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
            },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
    })

    return res.status(200).json(successResponse('Shift resident pool entries fetched', poolEntries))
  } catch (error) {
    logger.error({ err: error }, 'listShiftResidentPool failed')
    return res.status(500).json(errorResponse('Failed to fetch shift resident pool entries'))
  }
}

export const deleteShiftResidentPool = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const poolId = asParamString(req.params.poolId)
    const locationId = asParamString(req.params.locationId)
    const updatedBy = req.user?.id ?? null

    const entry = await ShiftResidentPool.findOne({
      where: { id: poolId, locationId, isDeleted: false },
    })
    if (!entry) {
      return res.status(404).json(errorResponse('Shift resident pool entry not found'))
    }

    await entry.update({
      isDeleted: true,
      isActive: false,
      updatedBy,
    })

    return res.status(200).json(successResponse('Flat removed from shift pool', { id: poolId }))
  } catch (error) {
    logger.error({ err: error }, 'deleteShiftResidentPool failed')
    return res.status(500).json(errorResponse('Failed to remove flat from shift pool'))
  }
}

// ── Areas (legacy /shift-roster mount) ────────────────────────────────────────
const propertyInclude = {
  model: Property,
  as: 'property',
  attributes: ['id', 'property_name', 'isActive'],
}

export const createArea = async (req: AuthenticatedRequest, res: Response) => {
  const transaction = await sequelize.transaction()
  const locationId = asParamString(req.params.locationId)

  try {
    const { areaName, areaType, location, capacity, status = RosterAreaStatus.ACTIVE, description } = req.body
    const createdBy = req.user?.id

    if (locationId === 'all') {
      await transaction.rollback()
      return res.status(400).json(errorResponse("Cannot create area for 'all' locations. Please specify a location."))
    }

    const locationRecord = await Property.findByPk(locationId, { transaction })
    if (!locationRecord) {
      await transaction.rollback()
      return res.status(404).json(errorResponse('Location not found'))
    }

    const area = await ShiftArea.create(
      {
        areaName: String(areaName).trim(),
        areaType,
        location: String(location).trim(),
        capacity: capacity?.trim(),
        status,
        description: description?.trim(),
        locationId,
        createdBy: createdBy || null,
        updatedBy: createdBy || null,
      },
      { transaction },
    )

    await transaction.commit()

    const areaWithDetails = await ShiftArea.findByPk(area.id, {
      include: [propertyInclude],
    })

    return res.status(201).json(successResponse('Area created successfully', { area: areaWithDetails }))
  } catch (error) {
    await transaction.rollback()
    console.error('Error creating area:', error)
    return res.status(500).json(errorResponse('Failed to create area'))
  }
}

export const getAreas = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    const { page = 1, limit = 10, search = '', sortBy = 'createdAt', sortOrder = 'DESC', areaType, status } = req.query

    const offset = (Number(page) - 1) * Number(limit)
    const whereConditions: Record<string, unknown> = {
      locationId,
      isDeleted: false,
    }

    if (search) {
      whereConditions[Op.or as unknown as string] = [
        { areaName: { [Op.like]: `%${search}%` } },
        { location: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
      ]
    }
    if (areaType) whereConditions.areaType = areaType
    if (status) whereConditions.status = status

    const { count, rows: areas } = await ShiftArea.findAndCountAll({
      where: whereConditions,
      include: [propertyInclude],
      order: [[sortBy as string, sortOrder as string]],
      limit: Number(limit),
      offset,
      distinct: true,
    })

    const summary = {
      totalAreas: count,
      activeAreas: areas.filter((a) => a.status === RosterAreaStatus.ACTIVE).length,
      inactiveAreas: areas.filter((a) => a.status === RosterAreaStatus.INACTIVE).length,
    }

    return res.status(200).json(
      successResponse('Areas retrieved successfully', {
        areas,
        summary,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(count / Number(limit)),
          totalItems: count,
          itemsPerPage: Number(limit),
        },
      }),
    )
  } catch (error) {
    console.error('Error fetching areas:', error)
    return res.status(500).json(errorResponse('Failed to fetch areas'))
  }
}

export const updateArea = async (req: AuthenticatedRequest, res: Response) => {
  const transaction = await sequelize.transaction()
  const areaId = asParamString(req.params.areaId)

  try {
    const { areaName, areaType, location, capacity, status, description } = req.body
    const updatedBy = req.user?.id

    const area = await ShiftArea.findByPk(areaId, { transaction })
    if (!area || area.isDeleted) {
      await transaction.rollback()
      return res.status(404).json(errorResponse('Area not found'))
    }

    await area.update(
      {
        areaName: areaName?.trim(),
        areaType,
        location: location?.trim(),
        capacity: capacity?.trim(),
        status,
        description: description?.trim(),
        updatedBy: updatedBy || null,
      } as never,
      { transaction },
    )

    await transaction.commit()

    const updatedArea = await ShiftArea.findByPk(area.id, { include: [propertyInclude] })
    return res.status(200).json(successResponse('Area updated successfully', { area: updatedArea }))
  } catch (error) {
    await transaction.rollback()
    console.error('Error updating area:', error)
    return res.status(500).json(errorResponse('Failed to update area'))
  }
}

export const deleteArea = async (req: AuthenticatedRequest, res: Response) => {
  const transaction = await sequelize.transaction()
  const areaId = asParamString(req.params.areaId)

  try {
    const updatedBy = req.user?.id
    const area = await ShiftArea.findByPk(areaId, { transaction })
    if (!area || area.isDeleted) {
      await transaction.rollback()
      return res.status(404).json(errorResponse('Area not found'))
    }

    const activeAssignment = await ShiftAssignment.findOne({
      where: {
        areaId,
        isActive: true,
        isDeleted: false,
      },
      transaction,
    })

    if (activeAssignment) {
      await transaction.rollback()
      return res
        .status(400)
        .json(errorResponse('Cannot delete area. This area has active shift assignments. Please remove them first.'))
    }

    await area.update({ isDeleted: true, updatedBy: updatedBy || null } as never, { transaction })
    await transaction.commit()
    return res.status(200).json(successResponse('Area deleted successfully'))
  } catch (error) {
    await transaction.rollback()
    console.error('Error deleting area:', error)
    return res.status(500).json(errorResponse('Failed to delete area'))
  }
}
