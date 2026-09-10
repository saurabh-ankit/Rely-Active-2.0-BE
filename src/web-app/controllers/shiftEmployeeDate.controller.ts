import type { Response } from 'express'
import { Op } from 'sequelize'
import sequelize from '../../config/db/index.js'
import { logger } from '../../config/logger.js'
import { LEAVE_TYPES, ShiftEmployeeDateStatus, type LeaveType } from '../../enums/roster.enum.js'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import {
  ShiftAssignment,
  Role,
  ShiftArea,
  ShiftDate,
  ShiftResidentPool,
  Shift,
  User,
  UserDetail,
  UserLocation,
} from '../../models/index.js'
import { asParamString, eachDay, doSlotRangesOverlap, resolveLifecycleRosterStatus } from '../../utils/roster.util.js'
import { errorResponse, successResponse } from '../../utils/response/index.js'

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
