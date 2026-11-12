import { Op } from 'sequelize'
import { Shift, ShiftArea, ShiftAssignment, ShiftDate } from '../models/index.js'
import { ShiftEmployeeDateStatus } from '../enums/roster.enum.js'
import { businessClock } from '../utils/roster.util.js'

/** Who is on duty right now; used by the ticket Assign list and by ticket auto-assign. */
export interface EmployeeShiftInfo {
  isOnShift: boolean
  isScheduledToday: boolean
  /** Marked absent, on a day off, or covered by someone else today */
  isOffToday: boolean
  shiftName: string | null
  startTime: string | null
  endTime: string | null
  workingDays: string[]
  areaName: string | null
  slotTimeRange: string | null
  startDate: string | null
  endDate: string | null
}

/** A shift date with one of these statuses means the employee is not working today. */
const OFF_STATUSES = [ShiftEmployeeDateStatus.ABSENT, ShiftEmployeeDateStatus.DAY_OFF, ShiftEmployeeDateStatus.COVERED]

/** `HH:mm` (or `HH:mm:ss`) to minutes since midnight. */
function timeToMinutes(value?: string | null): number | null {
  if (!value) return null
  const [h, m] = value.split(':')
  const hours = Number(h)
  const minutes = Number(m || 0)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return hours * 60 + minutes
}

/**
 * Today's shift for each employee.
 * Returns a map of employeeId -> shift info (only employees with a shift today).
 */
export async function getShiftInfoForEmployees(
  employeeIds: string[],
  locId?: string,
): Promise<Record<string, EmployeeShiftInfo>> {
  if (employeeIds.length === 0) return {}

  // Shift days and hours are in Indian time; the server's own clock may be UTC.
  const { ymd: today, weekday: todayName, minutes: nowMinutes } = businessClock()

  const assignments = (await ShiftAssignment.findAll({
    where: {
      employeeId: { [Op.in]: employeeIds },
      isActive: true,
      isDeleted: false,
      startDate: { [Op.lte]: today },
      endDate: { [Op.gte]: today },
      ...(locId ? { locationId: locId } : {}),
    },
    include: [
      { model: Shift, as: 'shift', required: false },
      { model: ShiftArea, as: 'area', required: false, attributes: ['id', 'areaName', 'areaType'] },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })) as any[]

  // Today's roster entries marking someone absent / off
  const offAssignmentIds = new Set<string>()
  if (assignments.length > 0) {
    const offDates = await ShiftDate.findAll({
      where: {
        employeeShiftAssignmentId: { [Op.in]: assignments.map((a) => a.id) },
        date: today,
        status: { [Op.in]: OFF_STATUSES },
        isDeleted: false,
      },
      attributes: ['employeeShiftAssignmentId'],
    })
    offDates.forEach((d) => offAssignmentIds.add(d.employeeShiftAssignmentId))
  }

  const byEmployee: Record<string, EmployeeShiftInfo> = {}

  for (const assignment of assignments) {
    const workingDays: string[] = Array.isArray(assignment.workingDays) ? assignment.workingDays : []
    // An empty working-days list means the shift runs every day.
    const isScheduledToday =
      workingDays.length === 0 || workingDays.some((day: string) => day.toLowerCase() === todayName)
    const isOffToday = offAssignmentIds.has(assignment.id)

    const startTime = assignment.shift?.startTime || null
    const endTime = assignment.shift?.endTime || null
    const startMinutes = timeToMinutes(startTime)
    const endMinutes = timeToMinutes(endTime)

    let withinHours = false
    if (startMinutes !== null && endMinutes !== null) {
      withinHours =
        endMinutes >= startMinutes
          ? nowMinutes >= startMinutes && nowMinutes <= endMinutes
          : // Overnight shift, e.g. 22:00 - 06:00
            nowMinutes >= startMinutes || nowMinutes <= endMinutes
    }

    const info: EmployeeShiftInfo = {
      isOnShift: isScheduledToday && withinHours && !isOffToday,
      isScheduledToday,
      isOffToday,
      shiftName: assignment.shift?.name || null,
      startTime,
      endTime,
      workingDays,
      areaName: assignment.area?.areaName || assignment.area?.areaType || null,
      slotTimeRange: assignment.slotTimeRange || null,
      startDate: assignment.startDate || null,
      endDate: assignment.endDate || null,
    }

    // Prefer the shift the employee is actually on right now.
    const existing = byEmployee[assignment.employeeId]
    if (!existing || (info.isOnShift && !existing.isOnShift)) {
      byEmployee[assignment.employeeId] = info
    }
  }

  return byEmployee
}
