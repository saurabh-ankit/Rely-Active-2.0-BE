import type { NextFunction, Request, Response } from 'express'
import { Op, type WhereOptions } from 'sequelize'
import { ShiftEmployeeDateStatus } from '../../../enums/roster.enum.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { uploadFileToS3 } from '../../../middlewares/s3/index.js'
import {
  Amenity,
  Department,
  HousekeepingTaskCompletion,
  PropertyBlock,
  PropertyFloor,
  PropertyUnit,
  Role,
  Shift,
  ShiftArea,
  ShiftAssignment,
  ShiftDate,
  UserLocation,
  type HousekeepingPhotoAttachment,
  type HousekeepingTaskAttachments,
  type HousekeepingTaskStatus,
} from '../../../models/index.js'
import { AuthorizationService } from '../../../services/authorization.service.js'
import {
  addDaysYmd,
  hasWindowEndPassedOnDate,
  minutesPastWindowEnd,
  parseSlotTimeRange,
  parseTimeToMinutes,
  resolveBreakBetweenDuties,
  toAbsoluteDutyWindow,
  todayYmdLocal,
} from '../../../utils/roster.util.js'
import { isDepartmentManagerRole, isOperationalStaffRole } from './staffAuth.controller.js'
import type {
  CompleteHousekeepingTaskInput,
  HousekeepingRosterQuery,
  HousekeepingSummaryQuery,
  HousekeepingTasksQuery,
} from '../../../validations/housekeeping.validation.js'

export const HK_DEPARTMENT_CODES = ['HK', 'HOUSEKEEPING'] as const

const WEEK_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

type ShiftWithTimes = Shift & {
  name?: string
  startTime?: string
  endTime?: string
}

type AreaRel = { id?: string; areaName?: string }
type BlockRel = { id?: string; block_name?: string }
type FloorRel = { id?: string; floor_name?: string | null; floor_number?: number | null }
type UnitRel = { id?: string; unit_number?: string }
type AmenityRel = { id?: string; name?: string }

type AssignmentWithRelations = ShiftAssignment & {
  employeeId: string
  shift?: ShiftWithTimes
  workingDays?: string[] | null
  slotTimeRange?: string | null
  notes?: string | null
  areaId?: string | null
  blockId?: string | null
  floorId?: string | null
  unitId?: string | null
  amenityId?: string | null
  startDate?: string
  endDate?: string
  area?: AreaRel | null
  block?: BlockRel | null
  floor?: FloorRel | null
  unit?: UnitRel | null
  amenity?: AmenityRel | null
}

type CompletionRel = HousekeepingTaskCompletion & {
  status: HousekeepingTaskStatus
  comment?: string | null
  attachments?: HousekeepingTaskAttachments | null
  startedAt?: Date | null
  completedAt?: Date | null
  extraMinutes?: number | null
}

type ShiftDateWithRelations = ShiftDate & {
  shiftAssignment?: AssignmentWithRelations
  housekeepingCompletion?: CompletionRel | null
  coveredByEmployeeId?: string | null
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function userIdOf(req: Request): string | null {
  return (req as AuthenticatedRequest).user?.id ?? null
}

function sendError(res: Response, err: unknown, logLabel: string): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, message: err.message })
    return
  }
  console.error(logLabel, err)
  res.status(500).json({ success: false, message: err instanceof Error ? err.message : 'Internal server error' })
}

/** Only Housekeeping Operational Staff (not Department Managers) may use HK mobile APIs. */
export async function requireHousekeepingStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = userIdOf(req)
    if (!id) {
      res.status(401).json({ success: false, message: 'Not authenticated' })
      return
    }
    const ctx = await AuthorizationService.getUserAuthorizationContext(id)
    if (ctx.isSuperAdmin) {
      next()
      return
    }

    const hkLocs = await UserLocation.findAll({
      where: { userId: id, isDeleted: false },
      include: [
        {
          model: Department,
          as: 'department',
          where: {
            [Op.or]: [
              { code: { [Op.in]: [...HK_DEPARTMENT_CODES] } },
              { name: { [Op.like]: '%housekeeping%' } },
              { name: { [Op.like]: '%Housekeeping%' } },
              { name: { [Op.like]: '%cleaning%' } },
              { name: { [Op.like]: '%Cleaning%' } },
            ],
          },
          required: true,
        },
        {
          model: Role,
          as: 'role',
          required: false,
        },
      ],
    })

    if (!hkLocs.length) {
      res.status(403).json({ success: false, message: 'Only Housekeeping staff can access this resource.' })
      return
    }

    const isOpsStaff = hkLocs.some((ul) => {
      const role = (ul as UserLocation & { role?: Role | null }).role
      if (isDepartmentManagerRole(role?.code, role?.name)) return false
      return isOperationalStaffRole(role?.code, role?.name)
    })

    if (!isOpsStaff) {
      res.status(403).json({
        success: false,
        message:
          'Access restricted: Housekeeping Department Managers use the admin web app. Only Operational Staff can use Housekeeping mobile APIs.',
      })
      return
    }

    next()
  } catch (error) {
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Access check failed' })
  }
}

async function resolveLocationId(req: AuthenticatedRequest): Promise<string | null> {
  const queryLoc = (req.query.propertyId ||
    req.query.locationId ||
    req.headers['x-property-id'] ||
    req.headers['x-location-id']) as string | undefined

  if (queryLoc && queryLoc !== 'all' && queryLoc !== 'global' && queryLoc !== '00000000-0000-0000-0000-000000000000') {
    return queryLoc.trim()
  }

  if (req.user?.defaultLocationId && req.user.defaultLocationId !== '00000000-0000-0000-0000-000000000000') {
    return req.user.defaultLocationId
  }

  if (req.user?.id) {
    const userLoc = await UserLocation.findOne({
      where: { userId: req.user.id, isActive: true, isDeleted: false },
      attributes: ['locId'],
    })
    if (userLoc?.locId && userLoc.locId !== '00000000-0000-0000-0000-000000000000') {
      return userLoc.locId
    }
  }

  return null
}

function requireStaffContext(req: AuthenticatedRequest): { employeeId: string } {
  const employeeId = req.user?.id
  if (!employeeId || req.user?.residentId) {
    throw new HttpError(401, 'Staff authentication required')
  }
  return { employeeId }
}

function ymdFromDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function assignmentInclude() {
  return [
    {
      model: Shift,
      as: 'shift',
      attributes: ['id', 'name', 'shiftCode', 'startTime', 'endTime'],
    },
    {
      model: ShiftArea,
      as: 'area',
      attributes: ['id', 'areaName'],
      required: false,
    },
    {
      model: Amenity,
      as: 'amenity',
      attributes: ['id', 'name'],
      required: false,
    },
    {
      model: PropertyBlock,
      as: 'block',
      attributes: ['id', 'block_name'],
      required: false,
    },
    {
      model: PropertyFloor,
      as: 'floor',
      attributes: ['id', 'floor_name', 'floor_number'],
      required: false,
    },
    {
      model: PropertyUnit,
      as: 'unit',
      attributes: ['id', 'unit_number'],
      required: false,
    },
  ]
}

function buildTaskTitle(assignment?: AssignmentWithRelations | null): string {
  if (!assignment) return 'Housekeeping Task'
  if (assignment.area?.areaName) return assignment.area.areaName
  if (assignment.amenity?.name) return assignment.amenity.name

  const parts: string[] = []
  if (assignment.block?.block_name) parts.push(assignment.block.block_name)
  if (assignment.floor) {
    parts.push(assignment.floor.floor_name || `Floor ${assignment.floor.floor_number}`)
  }
  if (assignment.unit?.unit_number) {
    parts.push(`Unit ${assignment.unit.unit_number}`)
  } else if (assignment.floorId && !assignment.unitId) {
    parts.push('Entire floor')
  } else if (assignment.blockId && !assignment.floorId) {
    parts.push('Entire block')
  }

  if (parts.length) return parts.join(' · ')
  if (assignment.notes?.trim()) return assignment.notes.trim().slice(0, 80)
  return assignment.shift?.name || 'Housekeeping Task'
}

function resolveTimeRange(assignment?: AssignmentWithRelations | null): {
  timeRange: string | null
  startTime: string | null
  endTime: string | null
} {
  const shift = assignment?.shift
  if (assignment?.slotTimeRange?.trim()) {
    const parsed = parseSlotTimeRange(assignment.slotTimeRange)
    if (parsed) {
      const startH = String(Math.floor(parsed.startMinutes / 60)).padStart(2, '0')
      const startM = String(parsed.startMinutes % 60).padStart(2, '0')
      const endH = String(Math.floor(parsed.endMinutes / 60)).padStart(2, '0')
      const endM = String(parsed.endMinutes % 60).padStart(2, '0')
      return {
        timeRange: `${startH}:${startM} - ${endH}:${endM}`,
        startTime: `${startH}:${startM}`,
        endTime: `${endH}:${endM}`,
      }
    }
    const parts = assignment.slotTimeRange.split('-').map((p) => p.trim())
    return {
      timeRange: assignment.slotTimeRange,
      startTime: parts[0] || null,
      endTime: parts[1] || null,
    }
  }
  if (shift?.startTime && shift?.endTime) {
    return {
      timeRange: `${shift.startTime} - ${shift.endTime}`,
      startTime: shift.startTime,
      endTime: shift.endTime,
    }
  }
  return { timeRange: null, startTime: null, endTime: null }
}

function sortKeyMinutes(assignment?: AssignmentWithRelations | null): number {
  const { startTime } = resolveTimeRange(assignment)
  const mins = parseTimeToMinutes(startTime)
  return mins ?? 0
}

function storedTaskStatus(completion?: CompletionRel | null): HousekeepingTaskStatus {
  return completion?.status || 'PENDING'
}

/**
 * Effective status for API/UI:
 * - COMPLETED stays COMPLETED (may include extraMinutes if late)
 * - After scheduled end, incomplete work becomes OVERDUE
 */
function resolveEffectiveTaskStatus(
  dateYmd: string,
  startHHmm: string | null,
  endHHmm: string | null,
  completion?: CompletionRel | null,
): HousekeepingTaskStatus {
  const stored = storedTaskStatus(completion)
  if (stored === 'COMPLETED') return 'COMPLETED'
  if (hasWindowEndPassedOnDate(dateYmd, startHHmm, endHHmm)) return 'OVERDUE'
  return stored
}

function formatExtraTimeLabel(extraMinutes: number | null | undefined): string | null {
  if (extraMinutes == null || extraMinutes <= 0) return null
  const h = Math.floor(extraMinutes / 60)
  const m = extraMinutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function formatTask(sd: ShiftDateWithRelations) {
  const assignment = sd.shiftAssignment
  const completion = sd.housekeepingCompletion || null
  const times = resolveTimeRange(assignment)
  const status = resolveEffectiveTaskStatus(sd.date, times.startTime, times.endTime, completion)
  const shift = assignment?.shift
  const extraMinutes = completion?.status === 'COMPLETED' ? (completion.extraMinutes ?? null) : null

  return {
    id: sd.id,
    shiftDateId: sd.id,
    date: sd.date,
    title: buildTaskTitle(assignment),
    status,
    timeRange: times.timeRange,
    startTime: times.startTime,
    endTime: times.endTime,
    notes: assignment?.notes || sd.notes || null,
    rosterStatus: sd.status,
    isCover: !!sd.coveredByEmployeeId,
    extraMinutes,
    extraTimeLabel: formatExtraTimeLabel(extraMinutes),
    shift: shift
      ? {
          id: shift.id,
          name: shift.name,
          shiftCode: (shift as ShiftWithTimes & { shiftCode?: string }).shiftCode || null,
          startTime: shift.startTime,
          endTime: shift.endTime,
        }
      : null,
    location: {
      areaId: assignment?.areaId || null,
      areaName: assignment?.area?.areaName || null,
      amenityId: assignment?.amenityId || null,
      amenityName: assignment?.amenity?.name || null,
      blockId: assignment?.blockId || null,
      blockName: assignment?.block?.block_name || null,
      floorId: assignment?.floorId || null,
      floorName: assignment?.floor?.floor_name || null,
      floorNumber: assignment?.floor?.floor_number ?? null,
      unitId: assignment?.unitId || null,
      unitNumber: assignment?.unit?.unit_number || null,
    },
    completion: completion
      ? {
          id: completion.id,
          status: completion.status,
          comment: completion.comment || null,
          attachments: completion.attachments || { photos: [] },
          startedAt: completion.startedAt || null,
          completedAt: completion.completedAt || null,
          extraMinutes: completion.extraMinutes ?? null,
          extraTimeLabel: formatExtraTimeLabel(completion.extraMinutes),
        }
      : null,
  }
}

function summarizeTasks(tasks: ReturnType<typeof formatTask>[]) {
  const assigned = tasks.length
  const completed = tasks.filter((t) => t.status === 'COMPLETED').length
  const overdue = tasks.filter((t) => t.status === 'OVERDUE').length
  const inProgress = tasks.filter((t) => t.status === 'IN_PROGRESS').length
  const pending = tasks.filter((t) => t.status === 'PENDING').length
  return {
    assigned,
    completed,
    overdue,
    inProgress,
    pending,
    progressPercent: assigned === 0 ? 0 : Math.round((completed / assigned) * 100),
  }
}

/** Persist OVERDUE on incomplete rows whose window has ended (best-effort). */
async function syncOverdueCompletions(rows: ShiftDateWithRelations[]): Promise<void> {
  for (const sd of rows) {
    const times = resolveTimeRange(sd.shiftAssignment)
    const stored = storedTaskStatus(sd.housekeepingCompletion)
    if (stored === 'COMPLETED' || stored === 'OVERDUE') continue
    if (!hasWindowEndPassedOnDate(sd.date, times.startTime, times.endTime)) continue

    try {
      const existing = sd.housekeepingCompletion
      if (existing) {
        existing.status = 'OVERDUE'
        existing.updatedBy = existing.employeeId
        await existing.save()
        existing.status = 'OVERDUE'
      } else {
        const created = await HousekeepingTaskCompletion.create({
          shiftDateId: sd.id,
          employeeId: sd.shiftAssignment!.employeeId,
          locationId: sd.locationId,
          status: 'OVERDUE',
          createdBy: sd.shiftAssignment!.employeeId,
          updatedBy: sd.shiftAssignment!.employeeId,
        })
        sd.housekeepingCompletion = created as CompletionRel
      }
      if (sd.housekeepingCompletion) {
        sd.housekeepingCompletion.status = 'OVERDUE'
      }
      // Mirror onto roster shift card status for admin Shift & Roster.
      if (
        sd.status === ShiftEmployeeDateStatus.UPCOMING ||
        sd.status === ShiftEmployeeDateStatus.ON_DUTY ||
        sd.status === ShiftEmployeeDateStatus.COMPLETED ||
        sd.status === ShiftEmployeeDateStatus.OVERDUE
      ) {
        sd.status = ShiftEmployeeDateStatus.OVERDUE
        sd.updatedBy = sd.shiftAssignment!.employeeId
        await sd.save()
      }
    } catch (err) {
      console.error('Failed to sync housekeeping overdue status:', err)
    }
  }
}

/**
 * Ensure ShiftDate rows exist for the employee's assignments in [rangeStart, rangeEnd].
 */
async function ensureEmployeeShiftDates(
  employeeId: string,
  locationId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<void> {
  const assignments = (await ShiftAssignment.findAll({
    where: {
      locationId,
      employeeId,
      isDeleted: false,
      isActive: true,
      endDate: { [Op.gte]: rangeStart },
      startDate: { [Op.lte]: rangeEnd },
    },
  })) as AssignmentWithRelations[]

  for (const assignment of assignments) {
    const start = assignment.startDate! > rangeStart ? assignment.startDate! : rangeStart
    const end = assignment.endDate! < rangeEnd ? assignment.endDate! : rangeEnd
    if (start > end) continue

    const cur = new Date(`${start}T00:00:00`)
    const last = new Date(`${end}T00:00:00`)

    for (let d = new Date(cur); d <= last; d.setDate(d.getDate() + 1)) {
      if (assignment.workingDays && assignment.workingDays.length > 0) {
        const dayName = WEEK_DAYS[d.getDay()]
        if (!dayName || !assignment.workingDays.includes(dayName)) continue
      }
      const dateStr = ymdFromDate(d)

      const existing = await ShiftDate.findOne({
        where: {
          employeeShiftAssignmentId: assignment.id,
          date: dateStr,
          locationId,
          isDeleted: false,
        },
      })
      if (!existing) {
        await ShiftDate.create({
          employeeShiftAssignmentId: assignment.id,
          date: dateStr,
          locationId,
          areaId: assignment.areaId || null,
          status: ShiftEmployeeDateStatus.UPCOMING,
          createdBy: employeeId,
        })
      }
    }
  }
}

async function loadTasksForRange(
  employeeId: string,
  locationId: string,
  from: string,
  to: string,
): Promise<ShiftDateWithRelations[]> {
  await ensureEmployeeShiftDates(employeeId, locationId, from, to)

  const ownedWhere: WhereOptions = {
    locationId,
    isDeleted: false,
    date: { [Op.between]: [from, to] },
    status: { [Op.notIn]: [ShiftEmployeeDateStatus.DAY_OFF, ShiftEmployeeDateStatus.ABSENT] },
  }

  const owned = (await ShiftDate.findAll({
    where: ownedWhere,
    include: [
      {
        model: ShiftAssignment,
        as: 'shiftAssignment',
        where: { isDeleted: false, employeeId },
        required: true,
        include: assignmentInclude(),
      },
      {
        model: HousekeepingTaskCompletion,
        as: 'housekeepingCompletion',
        required: false,
        where: { isDeleted: false },
      },
    ],
  })) as ShiftDateWithRelations[]

  const covered = (await ShiftDate.findAll({
    where: {
      ...ownedWhere,
      coveredByEmployeeId: employeeId,
    },
    include: [
      {
        model: ShiftAssignment,
        as: 'shiftAssignment',
        where: { isDeleted: false },
        required: true,
        include: assignmentInclude(),
      },
      {
        model: HousekeepingTaskCompletion,
        as: 'housekeepingCompletion',
        required: false,
        where: { isDeleted: false },
      },
    ],
  })) as ShiftDateWithRelations[]

  const byId = new Map<string, ShiftDateWithRelations>()
  for (const row of [...owned, ...covered]) {
    byId.set(row.id, row)
  }

  const rows = [...byId.values()].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    return sortKeyMinutes(a.shiftAssignment) - sortKeyMinutes(b.shiftAssignment)
  })

  await syncOverdueCompletions(rows)
  return rows
}

async function loadOwnedShiftDate(
  shiftDateId: string,
  employeeId: string,
  locationId: string,
): Promise<ShiftDateWithRelations | null> {
  const row = (await ShiftDate.findOne({
    where: { id: shiftDateId, locationId, isDeleted: false },
    include: [
      {
        model: ShiftAssignment,
        as: 'shiftAssignment',
        where: { isDeleted: false },
        required: true,
        include: assignmentInclude(),
      },
      {
        model: HousekeepingTaskCompletion,
        as: 'housekeepingCompletion',
        required: false,
        where: { isDeleted: false },
      },
    ],
  })) as ShiftDateWithRelations | null

  if (!row) return null

  const assignmentEmployeeId = row.shiftAssignment?.employeeId
  const isOwner = assignmentEmployeeId === employeeId
  const isCover = row.coveredByEmployeeId === employeeId
  if (!isOwner && !isCover) return null
  return row
}

function getPhotoFiles(req: AuthenticatedRequest): Express.Multer.File[] {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | Express.Multer.File[] | undefined
  if (!files) return []
  if (Array.isArray(files)) return files
  return [...(files.photo || []), ...(files.photos || [])]
}

/**
 * GET /api/v1/mobile/l3/housekeeping/tasks
 */
export async function getHousekeepingTasks(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { employeeId } = requireStaffContext(req)
    const locationId = await resolveLocationId(req)
    if (!locationId) {
      res.status(400).json({ success: false, message: 'Unable to resolve staff location' })
      return
    }

    const query = req.query as unknown as HousekeepingTasksQuery
    const today = todayYmdLocal()
    const from = query.from || query.date || today
    const to = query.to || query.date || today

    const rows = await loadTasksForRange(employeeId, locationId, from, to)
    const tasks = rows.map(formatTask)
    const summary = summarizeTasks(tasks)

    const shiftTiming =
      tasks.find((t) => t.shift?.startTime && t.shift?.endTime)?.shift || (tasks[0]?.shift ? tasks[0].shift : null)

    res.status(200).json({
      success: true,
      message: 'Housekeeping tasks fetched successfully',
      data: {
        date: query.date || (from === to ? from : null),
        from,
        to,
        shift: shiftTiming
          ? {
              name: shiftTiming.name,
              startTime: shiftTiming.startTime,
              endTime: shiftTiming.endTime,
              timeRange:
                shiftTiming.startTime && shiftTiming.endTime
                  ? `${shiftTiming.startTime} - ${shiftTiming.endTime}`
                  : null,
            }
          : null,
        summary,
        tasks,
      },
    })
  } catch (err) {
    sendError(res, err, 'Get Housekeeping Tasks Error:')
  }
}

/**
 * GET /api/v1/mobile/l3/housekeeping/tasks/:shiftDateId
 */
export async function getHousekeepingTaskById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { employeeId } = requireStaffContext(req)
    const locationId = await resolveLocationId(req)
    if (!locationId) {
      res.status(400).json({ success: false, message: 'Unable to resolve staff location' })
      return
    }

    const shiftDateId = String(req.params.shiftDateId || '').trim()
    const row = await loadOwnedShiftDate(shiftDateId, employeeId, locationId)
    if (!row) {
      res.status(404).json({ success: false, message: 'Task not found' })
      return
    }

    res.status(200).json({
      success: true,
      message: 'Housekeeping task fetched successfully',
      data: formatTask(row),
    })
  } catch (err) {
    sendError(res, err, 'Get Housekeeping Task Error:')
  }
}

/**
 * GET /api/v1/mobile/l3/housekeeping/summary
 */
export async function getHousekeepingSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { employeeId } = requireStaffContext(req)
    const locationId = await resolveLocationId(req)
    if (!locationId) {
      res.status(400).json({ success: false, message: 'Unable to resolve staff location' })
      return
    }

    const query = req.query as unknown as HousekeepingSummaryQuery
    const date = query.date || todayYmdLocal()
    const rows = await loadTasksForRange(employeeId, locationId, date, date)
    const tasks = rows.map(formatTask)

    res.status(200).json({
      success: true,
      message: 'Housekeeping summary fetched successfully',
      data: {
        date,
        ...summarizeTasks(tasks),
      },
    })
  } catch (err) {
    sendError(res, err, 'Get Housekeeping Summary Error:')
  }
}

/**
 * GET /api/v1/mobile/l3/housekeeping/roster?from=&to=
 */
export async function getHousekeepingRoster(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { employeeId } = requireStaffContext(req)
    const locationId = await resolveLocationId(req)
    if (!locationId) {
      res.status(400).json({ success: false, message: 'Unable to resolve staff location' })
      return
    }

    const query = req.query as unknown as HousekeepingRosterQuery
    const { from, to } = query
    if (from > to) {
      res.status(400).json({ success: false, message: 'from must be on or before to' })
      return
    }

    // Cap range to 62 days to keep mobile payloads reasonable
    const maxEnd = addDaysYmd(from, 61)
    if (to > maxEnd) {
      res.status(400).json({ success: false, message: 'Date range cannot exceed 62 days' })
      return
    }

    const rows = await loadTasksForRange(employeeId, locationId, from, to)
    const tasks = rows.map(formatTask)

    const byDate = new Map<string, ReturnType<typeof formatTask>[]>()
    for (const task of tasks) {
      const list = byDate.get(task.date) || []
      list.push(task)
      byDate.set(task.date, list)
    }

    const days: Array<{
      date: string
      shift: { name: string | null; startTime: string | null; endTime: string | null; timeRange: string | null } | null
      shifts: Array<{
        id: string | null
        name: string | null
        startTime: string | null
        endTime: string | null
        timeRange: string | null
        taskCount: number
      }>
      summary: ReturnType<typeof summarizeTasks>
      tasks: ReturnType<typeof formatTask>[]
      blocks: Array<{
        type: 'work' | 'break'
        title: string
        startTime: string | null
        endTime: string | null
        timeRange: string | null
        status?: HousekeepingTaskStatus
        shiftDateId?: string
      }>
    }> = []

    let cursor = from
    while (cursor <= to) {
      const dayTasks = byDate.get(cursor) || []
      const shift = dayTasks.find((t) => t.shift?.startTime && t.shift?.endTime)?.shift || dayTasks[0]?.shift || null

      // One summary row per unique shift (Afternoon / Evening / …) for Daily Roster Summary.
      const shiftMap = new Map<
        string,
        {
          id: string | null
          name: string | null
          startTime: string | null
          endTime: string | null
          timeRange: string | null
          taskCount: number
        }
      >()
      for (const task of dayTasks) {
        const s = task.shift
        const key =
          s?.id || `${s?.name || 'Shift'}|${s?.startTime || ''}|${s?.endTime || ''}` || `task:${task.shiftDateId}`
        const existing = shiftMap.get(key)
        if (existing) {
          existing.taskCount += 1
          continue
        }
        const startTime = s?.startTime || task.startTime || null
        const endTime = s?.endTime || task.endTime || null
        shiftMap.set(key, {
          id: s?.id || null,
          name: s?.name || 'Shift',
          startTime,
          endTime,
          timeRange: startTime && endTime ? `${startTime} - ${endTime}` : task.timeRange || null,
          taskCount: 1,
        })
      }
      const shifts = [...shiftMap.values()].sort((a, b) => {
        const aMin = parseTimeToMinutes(a.startTime) ?? 0
        const bMin = parseTimeToMinutes(b.startTime) ?? 0
        return aMin - bMin
      })

      const blocks: (typeof days)[number]['blocks'] = []
      // Sort by absolute start so overnight windows stay after evening slots.
      const sorted = [...dayTasks].sort((a, b) => {
        const aWin = toAbsoluteDutyWindow(a.startTime, a.endTime)
        const bWin = toAbsoluteDutyWindow(b.startTime, b.endTime)
        const aMin = aWin?.startAbs ?? parseTimeToMinutes(a.startTime) ?? 0
        const bMin = bWin?.startAbs ?? parseTimeToMinutes(b.startTime) ?? 0
        if (aMin !== bMin) return aMin - bMin
        const aEnd = aWin?.endAbs ?? 0
        const bEnd = bWin?.endAbs ?? 0
        if (aEnd !== bEnd) return aEnd - bEnd
        return (a.title || '').localeCompare(b.title || '')
      })

      for (let i = 0; i < sorted.length; i++) {
        const task = sorted[i]!
        blocks.push({
          type: 'work',
          title: task.title,
          startTime: task.startTime,
          endTime: task.endTime,
          timeRange: task.timeRange,
          status: task.status,
          shiftDateId: task.shiftDateId,
        })
        const next = sorted[i + 1]
        if (!next) continue
        const gap = resolveBreakBetweenDuties(task.startTime, task.endTime, next.startTime)
        if (gap) {
          blocks.push({
            type: 'break',
            title: 'Break',
            startTime: gap.startTime,
            endTime: gap.endTime,
            timeRange: gap.timeRange,
          })
        }
      }

      days.push({
        date: cursor,
        shift: shift
          ? {
              name: shift.name,
              startTime: shift.startTime,
              endTime: shift.endTime,
              timeRange: shift.startTime && shift.endTime ? `${shift.startTime} - ${shift.endTime}` : null,
            }
          : null,
        shifts,
        summary: summarizeTasks(dayTasks),
        tasks: dayTasks,
        blocks,
      })

      cursor = addDaysYmd(cursor, 1)
    }

    res.status(200).json({
      success: true,
      message: 'Housekeeping roster fetched successfully',
      data: { from, to, days },
    })
  } catch (err) {
    sendError(res, err, 'Get Housekeeping Roster Error:')
  }
}

/**
 * POST /api/v1/mobile/l3/housekeeping/tasks/:shiftDateId/start
 */
export async function startHousekeepingTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { employeeId } = requireStaffContext(req)
    const locationId = await resolveLocationId(req)
    if (!locationId) {
      res.status(400).json({ success: false, message: 'Unable to resolve staff location' })
      return
    }

    const shiftDateId = String(req.params.shiftDateId || '').trim()
    const row = await loadOwnedShiftDate(shiftDateId, employeeId, locationId)
    if (!row) {
      res.status(404).json({ success: false, message: 'Task not found' })
      return
    }

    const existing = row.housekeepingCompletion
    if (existing?.status === 'COMPLETED') {
      res.status(400).json({ success: false, message: 'Task is already completed' })
      return
    }
    if (existing?.startedAt && (existing.status === 'IN_PROGRESS' || existing.status === 'OVERDUE')) {
      res.status(400).json({ success: false, message: 'Task is already started' })
      return
    }

    const times = resolveTimeRange(row.shiftAssignment)
    const now = new Date()
    const windowEnded = hasWindowEndPassedOnDate(row.date, times.startTime, times.endTime)
    const nextStatus: HousekeepingTaskStatus = windowEnded ? 'OVERDUE' : 'IN_PROGRESS'

    let completion: HousekeepingTaskCompletion
    if (existing) {
      existing.status = nextStatus
      if (!existing.startedAt) existing.startedAt = now
      existing.updatedBy = employeeId
      await existing.save()
      completion = existing
    } else {
      completion = await HousekeepingTaskCompletion.create({
        shiftDateId,
        employeeId,
        locationId,
        status: nextStatus,
        startedAt: now,
        createdBy: employeeId,
        updatedBy: employeeId,
      })
    }

    // Mirror start onto admin Shift & Roster card status.
    if (windowEnded) {
      if (
        row.status === ShiftEmployeeDateStatus.UPCOMING ||
        row.status === ShiftEmployeeDateStatus.ON_DUTY ||
        row.status === ShiftEmployeeDateStatus.COMPLETED ||
        row.status === ShiftEmployeeDateStatus.OVERDUE
      ) {
        row.status = ShiftEmployeeDateStatus.OVERDUE
        row.updatedBy = employeeId
        await row.save()
      }
    } else if (row.status === ShiftEmployeeDateStatus.UPCOMING || row.status === ShiftEmployeeDateStatus.ON_DUTY) {
      row.status = ShiftEmployeeDateStatus.ON_DUTY
      row.updatedBy = employeeId
      await row.save()
    }

    const refreshed = await loadOwnedShiftDate(shiftDateId, employeeId, locationId)
    res.status(200).json({
      success: true,
      message: 'Task started successfully',
      data: refreshed ? formatTask(refreshed) : { id: completion.id, status: completion.status },
    })
  } catch (err) {
    sendError(res, err, 'Start Housekeeping Task Error:')
  }
}

/**
 * POST /api/v1/mobile/l3/housekeeping/tasks/:shiftDateId/complete
 * Multipart: comment?, photo[] / photos[]
 */
export async function completeHousekeepingTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { employeeId } = requireStaffContext(req)
    const locationId = await resolveLocationId(req)
    if (!locationId) {
      res.status(400).json({ success: false, message: 'Unable to resolve staff location' })
      return
    }

    const shiftDateId = String(req.params.shiftDateId || '').trim()
    const row = await loadOwnedShiftDate(shiftDateId, employeeId, locationId)
    if (!row) {
      res.status(404).json({ success: false, message: 'Task not found' })
      return
    }

    if (row.housekeepingCompletion?.status === 'COMPLETED') {
      res.status(400).json({ success: false, message: 'Task is already completed' })
      return
    }

    const existing = row.housekeepingCompletion
    const canComplete = !!existing?.startedAt && (existing.status === 'IN_PROGRESS' || existing.status === 'OVERDUE')
    if (!canComplete) {
      res.status(400).json({
        success: false,
        message: 'Start the task before marking it complete',
      })
      return
    }

    const body = req.body as CompleteHousekeepingTaskInput
    const comment = typeof body.comment === 'string' ? body.comment.trim() : ''
    if (!comment) {
      res.status(400).json({ success: false, message: 'Comment is required to complete the task' })
      return
    }

    const photoFiles = getPhotoFiles(req)
    if (photoFiles.length === 0) {
      res.status(400).json({
        success: false,
        message: 'At least one photo is required to complete the task',
      })
      return
    }

    const photos: HousekeepingPhotoAttachment[] = []
    for (const file of photoFiles) {
      const uploaded = await uploadFileToS3(file, `housekeeping/${shiftDateId}/photos`)
      photos.push({
        url: uploaded.location,
        key: uploaded.key,
        contentType: uploaded.contentType,
        size: uploaded.size,
        originalName: file.originalname,
        uploadedAt: new Date().toISOString(),
      })
    }

    const now = new Date()
    const times = resolveTimeRange(row.shiftAssignment)
    const extraMinutes = minutesPastWindowEnd(row.date, times.startTime, times.endTime, now)
    const previousPhotos = existing!.attachments?.photos || []
    const attachments: HousekeepingTaskAttachments = {
      photos: [...previousPhotos, ...photos],
    }

    existing!.status = 'COMPLETED'
    existing!.comment = comment
    existing!.attachments = attachments
    existing!.completedAt = now
    existing!.extraMinutes = extraMinutes > 0 ? extraMinutes : null
    existing!.updatedBy = employeeId
    await existing!.save()
    const completion = existing!

    // Mirror task completion onto the roster shift card status (admin Shift & Roster).
    if (
      row.status === ShiftEmployeeDateStatus.UPCOMING ||
      row.status === ShiftEmployeeDateStatus.ON_DUTY ||
      row.status === ShiftEmployeeDateStatus.COMPLETED ||
      row.status === ShiftEmployeeDateStatus.OVERDUE
    ) {
      row.status = ShiftEmployeeDateStatus.COMPLETED
      row.updatedBy = employeeId
      await row.save()
    }

    const refreshed = await loadOwnedShiftDate(shiftDateId, employeeId, locationId)
    res.status(200).json({
      success: true,
      message: 'Task completed successfully',
      data: refreshed
        ? formatTask(refreshed)
        : {
            id: completion.id,
            status: completion.status,
            comment: completion.comment,
            attachments: completion.attachments,
            completedAt: completion.completedAt,
          },
    })
  } catch (err) {
    sendError(res, err, 'Complete Housekeeping Task Error:')
  }
}
