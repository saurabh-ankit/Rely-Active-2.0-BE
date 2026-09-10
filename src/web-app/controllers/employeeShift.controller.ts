import type { Response } from 'express'
import { Op } from 'sequelize'
import * as XLSX from 'xlsx'
import { logger } from '../../config/logger.js'
import { ShiftEmployeeDateStatus } from '../../enums/roster.enum.js'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { ShiftAssignment, ShiftDate, ShiftResidentPool, Shift, User, UserDetail } from '../../models/index.js'
import {
  asParamString,
  hasWindowStartPassedOnDate,
  isSlotWithinShift,
  parseSlotTimeRange,
  todayYmdLocal,
} from '../../utils/roster.util.js'
import { errorResponse, successResponse } from '../../utils/response/index.js'
import { autoGenerateShiftEmployeeDates, syncShiftDatesOnAreaChange } from './shiftEmployeeDate.controller.js'

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
