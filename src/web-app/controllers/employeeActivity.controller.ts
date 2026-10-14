import type { Request, Response } from 'express'
import { Op, literal, where as sqlWhere, type WhereOptions } from 'sequelize'
import {
  CareTask,
  CareTaskAssignment,
  Department,
  DoctorAppointment,
  FnbFoodDelivery,
  FnbGlobalMealSlot,
  FnbResidentOrder,
  GateEntry,
  LabTestSetting,
  PropertyUnit,
  Resident,
  ResidentCareTaskCompletion,
  ResidentLabReport,
  ResidentMedication,
  Role,
  Ticket,
  TicketActivityLog,
  TicketCategory,
  User,
  UserDetail,
  UserLocation,
} from '../../models/index.js'
import { gateRaisedByIncludes, raisedByOf } from '../../services/gateApproval.service.js'
import { AppointmentStatus } from '../../enums/appointment.enum.js'
import { TicketStatus } from '../../enums/ticket.enum.js'

/**
 * Which activity view an employee gets on their profile, derived from their
 * department (and role, to split doctors from nursing/caretaking staff).
 */
export type ActivityKind = 'tickets' | 'gate' | 'fnb' | 'medical-care' | 'medical-doctor' | 'none'

const TICKET_DEPARTMENTS = ['RNM', 'CON']
// Ticket stages mirror the admin Tickets page tabs:
//   In Progress — assigned (still OPEN until "Start Work"), started or on hold
//   Completed   — RESOLVED by staff, waiting for admin verification
//   Closed      — verified (CLOSED, or RESOLVED with verifiedAt) or CANCELLED
const IN_PROGRESS_TICKET_STATUSES = [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD]

const DEFAULT_RANGE_DAYS = 30
const MAX_PAGE_SIZE = 100

interface ActivityContext {
  userId: string
  locId: string | null
  from: Date
  to: Date
  page: number
  limit: number
}

interface WorkLogEvent {
  id: string
  at: Date | string
  module: 'ticket' | 'gate' | 'fnb' | 'care' | 'clinical'
  action: string
  title: string
  subtitle: string | null
  /** Short reference shown as a chip, e.g. the ticket number. */
  code?: string | null
  fromStatus?: string | null
  toStatus?: string | null
  /** Free-text remark left with the action (boilerplate stripped). */
  note?: string | null
  /** Who performed the action, when it was not the employee themself. */
  actor?: string | null
  refId: string | null
}

// ── Request helpers ─────────────────────────────────────────────────────────

const parseDay = (value: unknown, endOfDay: boolean): Date | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`)
  return Number.isNaN(date.getTime()) ? null : date
}

const toDateOnly = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function buildContext(req: Request): ActivityContext {
  const to = parseDay(req.query.to, true) ?? new Date()
  const from =
    parseDay(req.query.from, false) ??
    (() => {
      const d = new Date(to)
      d.setDate(d.getDate() - DEFAULT_RANGE_DAYS)
      d.setHours(0, 0, 0, 0)
      return d
    })()
  const locId = (req.query.locId || req.query.locationId) as string | undefined
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1)
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(String(req.query.limit ?? '20'), 10) || 20))
  return { userId: req.params.id as string, locId: locId || null, from, to, page, limit }
}

const between = (ctx: ActivityContext) => ({ [Op.between]: [ctx.from, ctx.to] })
const betweenDays = (ctx: ActivityContext) => ({ [Op.between]: [toDateOnly(ctx.from), toDateOnly(ctx.to)] })

/** Adds a location filter on `column` only when the caller scoped the request to a property. */
const withLoc = (ctx: ActivityContext, column: string, where: Record<string | symbol, unknown>) =>
  (ctx.locId ? { ...where, [column]: ctx.locId } : where) as WhereOptions

const residentName = (r?: Resident | null) => (r ? `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || null : null)

const residentInclude = {
  model: Resident,
  as: 'resident',
  attributes: ['id', 'firstName', 'lastName', 'unitId'],
  include: [{ model: PropertyUnit, as: 'unit', attributes: ['id', 'unit_number'] }],
}

const paged = <T>(ctx: ActivityContext, rows: T[], total: number) => ({
  rows,
  pagination: { page: ctx.page, limit: ctx.limit, total, totalPages: Math.ceil(total / ctx.limit) },
})

// ── Kind resolution ─────────────────────────────────────────────────────────

async function resolveKind(userId: string, locId: string | null) {
  const locations = await UserLocation.findAll({
    where: { userId, isDeleted: false },
    include: [
      { model: Department, as: 'department', attributes: ['id', 'code', 'name'] },
      { model: Role, as: 'role', attributes: ['id', 'code', 'name'] },
    ],
  })
  const primary =
    (locId && locations.find((l) => l.locId === locId && l.department)) ||
    locations.find((l) => l.department) ||
    locations[0]

  const departmentCode = primary?.department?.code ?? null
  const roleCodes = locations.map((l) => l.role?.code).filter((c): c is string => !!c)

  let kind: ActivityKind = 'none'
  if (roleCodes.includes('DOCTOR')) kind = 'medical-doctor'
  else if (departmentCode && TICKET_DEPARTMENTS.includes(departmentCode)) kind = 'tickets'
  else if (departmentCode === 'SEC') kind = 'gate'
  else if (departmentCode === 'FNB') kind = 'fnb'
  else if (departmentCode === 'MED') kind = 'medical-care'

  return { kind, departmentCode, departmentName: primary?.department?.name ?? null }
}

// ── Tickets (RNM / Concierge) ───────────────────────────────────────────────

const ticketOwnership = (userId: string) => ({
  [Op.or]: [{ assignedToUserId: userId }, { completedByUserId: userId }],
})

/** When a ticket left the employee's plate; used to place finished tickets in the date range. */
const TICKET_FINISHED_AT = literal(
  'COALESCE(`Ticket`.`verifiedAt`, `Ticket`.`closedAt`, `Ticket`.`completedAt`, `Ticket`.`resolvedAt`, `Ticket`.`updatedAt`)',
)

/**
 * Ticket filters matching the admin tabs. Work still in progress or awaiting
 * verification is shown whatever the dates; closed tickets follow the range by
 * the day they were closed (not the day they were raised).
 */
function ticketWhere(ctx: ActivityContext, filter?: string): WhereOptions {
  const inProgress = { assignedToUserId: ctx.userId, status: IN_PROGRESS_TICKET_STATUSES }
  const completed = { ...ticketOwnership(ctx.userId), status: TicketStatus.RESOLVED, verifiedAt: null }
  const closed = (statuses: 'verified' | 'cancelled' | 'all') => ({
    ...ticketOwnership(ctx.userId),
    [Op.and]: [
      sqlWhere(TICKET_FINISHED_AT, between(ctx)),
      statuses === 'cancelled'
        ? { status: TicketStatus.CANCELLED }
        : {
            [Op.or]: [
              { status: TicketStatus.CLOSED },
              { status: TicketStatus.RESOLVED, verifiedAt: { [Op.ne]: null } },
              ...(statuses === 'all' ? [{ status: TicketStatus.CANCELLED }] : []),
            ],
          },
    ],
  })

  let where: Record<string | symbol, unknown>
  switch (filter) {
    case 'in_progress':
      where = inProgress
      break
    case 'completed':
      where = completed
      break
    case 'closed':
      where = closed('all')
      break
    case 'verified':
      where = closed('verified')
      break
    case 'cancelled':
      where = closed('cancelled')
      break
    default:
      where = { [Op.or]: [inProgress, completed, closed('all')] }
  }
  return withLoc(ctx, 'locId', where)
}

type TicketTimes = {
  status: TicketStatus
  createdAt?: Date | string
  workStartedAt?: Date | null
  completedAt?: Date | null
  resolvedAt?: Date | null
  closedAt?: Date | null
  verifiedAt?: Date | null
}

/** The admin page's label for a ticket: In progress, On hold, Completed, Closed (verified) or Cancelled. */
const ticketStage = (t: TicketTimes) => {
  if (t.status === TicketStatus.CANCELLED) return 'CANCELLED'
  if (t.status === TicketStatus.CLOSED || t.verifiedAt) return 'CLOSED'
  if (t.status === TicketStatus.RESOLVED) return 'COMPLETED'
  if (t.status === TicketStatus.ON_HOLD) return 'ON_HOLD'
  return 'IN_PROGRESS'
}

/** Hours from work start (or raise, when start wasn't recorded) until the work was done. */
const resolutionHours = (t: TicketTimes) => {
  const end = t.completedAt ?? t.resolvedAt ?? t.closedAt ?? t.verifiedAt
  const start = t.workStartedAt ?? t.createdAt
  if (!end || !start) return null
  const hours = (new Date(end).getTime() - new Date(start).getTime()) / 36e5
  return hours >= 0 ? Math.round(hours * 100) / 100 : null
}

const TICKET_TIME_ATTRS = [
  'status',
  'createdAt',
  'workStartedAt',
  'completedAt',
  'resolvedAt',
  'closedAt',
  'verifiedAt',
] as const

async function ticketSummary(ctx: ActivityContext) {
  const [inProgressRows, completedRows, closedRows, cancelled] = await Promise.all([
    Ticket.findAll({ attributes: ['status'], where: ticketWhere(ctx, 'in_progress'), raw: true }),
    Ticket.findAll({ attributes: [...TICKET_TIME_ATTRS], where: ticketWhere(ctx, 'completed'), raw: true }),
    Ticket.findAll({ attributes: [...TICKET_TIME_ATTRS], where: ticketWhere(ctx, 'verified'), raw: true }),
    Ticket.count({ where: ticketWhere(ctx, 'cancelled') }),
  ])
  const durations = [...completedRows, ...closedRows]
    .map((t) => resolutionHours(t as TicketTimes))
    .filter((h): h is number => h != null)

  return {
    total: inProgressRows.length + completedRows.length + closedRows.length + cancelled,
    inProgress: inProgressRows.length,
    notStarted: inProgressRows.filter((t) => t.status === TicketStatus.OPEN).length,
    completed: completedRows.length,
    closed: closedRows.length,
    cancelled,
    avgResolutionHours: durations.length
      ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 100) / 100
      : null,
  }
}

async function ticketRecords(ctx: ActivityContext, status?: string) {
  const { rows, count } = await Ticket.findAndCountAll({
    attributes: [
      'id',
      'ticketNumber',
      'title',
      'category',
      'priority',
      ...TICKET_TIME_ATTRS,
      'updatedAt',
      'assignedToUserId',
      'completedByUserId',
    ],
    where: ticketWhere(ctx, status),
    include: [
      { model: PropertyUnit, as: 'unit', attributes: ['id', 'unit_number'] },
      { model: Resident, as: 'resident', attributes: ['id', 'firstName', 'lastName'] },
      { model: TicketCategory, as: 'categoryObj', attributes: ['id', 'name'] },
    ],
    // Work in hand first (in progress, then awaiting verification), then most recently closed.
    order: [
      [
        literal(
          "CASE WHEN `Ticket`.`status` IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD') THEN 0 WHEN `Ticket`.`status` = 'RESOLVED' AND `Ticket`.`verifiedAt` IS NULL THEN 1 ELSE 2 END",
        ),
        'ASC',
      ],
      [TICKET_FINISHED_AT, 'DESC'],
    ],
    limit: ctx.limit,
    offset: (ctx.page - 1) * ctx.limit,
    distinct: true,
  })

  return paged(
    ctx,
    rows.map((t) => {
      const json = t.toJSON() as Ticket & {
        createdAt: Date
        updatedAt: Date
        unit?: PropertyUnit
        resident?: Resident
        categoryObj?: TicketCategory
      }
      const stage = ticketStage(json)
      const isDone = stage === 'COMPLETED' || stage === 'CLOSED'
      return {
        id: json.id,
        ticketNumber: json.ticketNumber,
        title: json.title,
        category: json.categoryObj?.name ?? (typeof json.category === 'string' ? json.category : null),
        priority: json.priority,
        status: stage,
        // Assigned but the employee hasn't tapped "Start Work" yet.
        notStarted: json.status === TicketStatus.OPEN,
        unitNumber: json.unit?.unit_number ?? null,
        residentName: residentName(json.resident),
        createdAt: json.createdAt,
        workStartedAt: json.workStartedAt,
        completedAt: isDone ? (json.completedAt ?? json.resolvedAt ?? json.closedAt ?? json.verifiedAt) : null,
        verifiedAt: json.verifiedAt ?? (json.status === TicketStatus.CLOSED ? json.closedAt : null),
        cancelledAt: stage === 'CANCELLED' ? json.updatedAt : null,
        resolutionHours: isDone ? resolutionHours(json) : null,
        completedByMe: json.completedByUserId === ctx.userId,
      }
    }),
    count,
  )
}

// ── Gate & Security ─────────────────────────────────────────────────────────
//
// A guard's part in a gate entry can be any of: approving or rejecting it (the
// approver columns, staff only), checking the visitor in, checking them out.
// Most passes are approved by residents, so each is shown separately.

const gateOwnership = (userId: string) => ({
  [Op.or]: [
    { createdBy: userId, entrySource: 'Walkin' },
    { approvedBy: userId },
    { clockedInBy: userId },
    { clockedOutBy: userId },
  ],
})

const APPROVER_LABELS: Record<string, string> = { STAFF: 'Staff', RESIDENT: 'Resident', FAMILY_MEMBER: 'Family member' }

/** "Sonu Kumar" from a User with its profile, falling back to username/email. */
const staffName = (u?: (User & { profile?: UserDetail | null }) | null) =>
  u ? `${u.profile?.firstName ?? ''} ${u.profile?.lastName ?? ''}`.trim() || u.username || u.email || null : null

const staffInclude = (as: string) => ({
  model: User,
  as,
  attributes: ['id', 'username', 'email'],
  include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
})

async function gateSummary(ctx: ActivityContext) {
  const [raised, approved, rejected, checkIns, checkOuts, byType] = await Promise.all([
    // Walk-in passes this guard raised for a resident's approval.
    GateEntry.count({
      where: withLoc(ctx, 'locId', { createdBy: ctx.userId, entrySource: 'Walkin', createdAt: between(ctx) }),
    }),
    GateEntry.count({
      where: withLoc(ctx, 'locId', {
        approvedBy: ctx.userId,
        approvedAt: between(ctx),
        status: { [Op.ne]: 'Rejected' },
      }),
    }),
    GateEntry.count({
      where: withLoc(ctx, 'locId', { approvedBy: ctx.userId, approvedAt: between(ctx), status: 'Rejected' }),
    }),
    GateEntry.count({ where: withLoc(ctx, 'locId', { clockedInBy: ctx.userId, clockedInAt: between(ctx) }) }),
    GateEntry.count({ where: withLoc(ctx, 'locId', { clockedOutBy: ctx.userId, clockedOutAt: between(ctx) }) }),
    GateEntry.count({
      where: withLoc(ctx, 'locId', { clockedInBy: ctx.userId, clockedInAt: between(ctx) }),
      group: ['visitorType'],
    }),
  ])
  return {
    raised,
    approved,
    rejected,
    checkIns,
    checkOuts,
    byVisitorType: Object.fromEntries(
      (byType as unknown as Array<{ visitorType: string; count: number }>).map((r) => [r.visitorType, r.count]),
    ),
  }
}

async function gateRecords(ctx: ActivityContext, status?: string) {
  const where: Record<string | symbol, unknown> = {
    ...gateOwnership(ctx.userId),
    [Op.and]: [
      {
        [Op.or]: [
          { createdBy: ctx.userId, entrySource: 'Walkin', createdAt: between(ctx) },
          { approvedBy: ctx.userId, approvedAt: between(ctx) },
          { clockedInBy: ctx.userId, clockedInAt: between(ctx) },
          { clockedOutBy: ctx.userId, clockedOutAt: between(ctx) },
        ],
      },
    ],
  }
  if (status) where.status = status

  const { rows, count } = await GateEntry.findAndCountAll({
    where: withLoc(ctx, 'locId', where),
    include: [
      { model: PropertyUnit, as: 'unit', attributes: ['id', 'unit_number'] },
      staffInclude('clockedInByUser'),
      staffInclude('clockedOutByUser'),
      ...gateRaisedByIncludes(),
    ],
    order: [
      [literal('COALESCE(`GateEntry`.`clockedInAt`, `GateEntry`.`approvedAt`, `GateEntry`.`createdAt`)'), 'DESC'],
    ],
    limit: ctx.limit,
    offset: (ctx.page - 1) * ctx.limit,
    distinct: true,
  })

  return paged(
    ctx,
    rows.map((e) => {
      const json = e.toJSON() as GateEntry & {
        createdAt: Date
        numberOfPeople?: number | null
        unit?: PropertyUnit
        clockedInByUser?: User & { profile?: UserDetail | null }
        clockedOutByUser?: User & { profile?: UserDetail | null }
      }
      const minutesInside =
        json.clockedInAt && json.clockedOutAt
          ? Math.max(
              0,
              Math.round((new Date(json.clockedOutAt).getTime() - new Date(json.clockedInAt).getTime()) / 60000),
            )
          : null
      const raisedBy = raisedByOf(json)
      const roles = [
        raisedBy?.userId === ctx.userId ? 'raised' : null,
        json.approvedBy === ctx.userId ? (json.status === 'Rejected' ? 'rejected' : 'approved') : null,
        json.clockedInBy === ctx.userId && json.clockedInAt ? 'checked_in' : null,
        json.clockedOutBy === ctx.userId ? 'checked_out' : null,
      ].filter((r): r is string => !!r)
      return {
        id: json.id,
        entrySource: json.entrySource,
        visitorType: json.visitorType,
        visitorName: json.visitorName,
        visitorPhone: json.visitorPhone,
        photo: Array.isArray(json.visitorPhotos) ? (json.visitorPhotos[0] ?? null) : null,
        numberOfPeople: json.numberOfPeople ?? null,
        vehicleNumber: json.vehicleNumber || null,
        company: json.company || null,
        personToMeet: json.personToMeet || null,
        notes: json.notes || null,
        status: json.status,
        unitNumber: json.unit?.unit_number ?? null,
        requestedAt: json.createdAt,
        raisedBy: raisedBy
          ? {
              type: raisedBy.type,
              typeLabel: APPROVER_LABELS[raisedBy.type] ?? raisedBy.type,
              name: raisedBy.name,
              residentName: raisedBy.residentName,
              byMe: raisedBy.userId === ctx.userId,
            }
          : null,
        approval: json.approverType
          ? {
              type: json.approverType,
              typeLabel: APPROVER_LABELS[json.approverType] ?? json.approverType,
              name: json.approverName,
              at: json.approvedAt,
              byMe: json.approvedBy === ctx.userId,
            }
          : null,
        checkIn: json.clockedInAt
          ? { at: json.clockedInAt, by: staffName(json.clockedInByUser), byMe: json.clockedInBy === ctx.userId }
          : null,
        checkOut: json.clockedOutAt
          ? { at: json.clockedOutAt, by: staffName(json.clockedOutByUser), byMe: json.clockedOutBy === ctx.userId }
          : null,
        minutesInside,
        myRoles: roles,
      }
    }),
    count,
  )
}

// ── Food & Beverage ─────────────────────────────────────────────────────────

async function fnbSummary(ctx: ActivityContext) {
  const grouped = (await FnbFoodDelivery.count({
    where: withLoc(ctx, 'locId', { employeeId: ctx.userId, createdAt: between(ctx) }),
    group: ['deliveryStatus'],
  })) as unknown as Array<{ deliveryStatus: string; count: number }>
  const byStatus = Object.fromEntries(grouped.map((r) => [r.deliveryStatus, r.count]))
  const total = grouped.reduce((sum, r) => sum + r.count, 0)
  return {
    total,
    delivered: byStatus.delivered ?? 0,
    failed: byStatus.failed ?? 0,
    pending: (byStatus.assigned ?? 0) + (byStatus.delivering ?? 0),
  }
}

async function fnbRecords(ctx: ActivityContext, status?: string) {
  const where: Record<string, unknown> = { employeeId: ctx.userId, createdAt: between(ctx) }
  if (status) where.deliveryStatus = status

  const { rows, count } = await FnbFoodDelivery.findAndCountAll({
    where: withLoc(ctx, 'locId', where),
    include: [
      {
        model: FnbResidentOrder,
        as: 'order',
        attributes: ['id', 'date', 'orderType', 'serviceType', 'quantity', 'totalAmount', 'orderStatus'],
        include: [residentInclude, { model: FnbGlobalMealSlot, as: 'globalMealSlot', attributes: ['id', 'name'] }],
      },
    ],
    order: [['createdAt', 'DESC']],
    limit: ctx.limit,
    offset: (ctx.page - 1) * ctx.limit,
    distinct: true,
  })

  return paged(
    ctx,
    rows.map((d) => {
      const order = d.order as (FnbResidentOrder & { globalMealSlot?: { name?: string } }) | undefined
      return {
        id: d.id,
        orderId: d.orderId,
        deliveryStatus: d.deliveryStatus,
        deliveryDate: d.deliveryDate ?? order?.date ?? null,
        deliveredAt: d.deliveredAt,
        deliveryCharge: d.deliveryCharge,
        mealSlot: order?.globalMealSlot?.name ?? null,
        orderType: order?.orderType ?? null,
        quantity: order?.quantity ?? null,
        residentName: residentName(order?.resident),
        unitNumber: order?.resident?.unit?.unit_number ?? null,
        createdAt: d.createdAt,
      }
    }),
    count,
  )
}

// ── Medical: nursing / caretaking staff ─────────────────────────────────────

async function careSummary(ctx: ActivityContext) {
  const [completed, cancelled, residents, activeAssignments] = await Promise.all([
    ResidentCareTaskCompletion.count({
      where: withLoc(ctx, 'propertyId', {
        completedBy: ctx.userId,
        status: 'COMPLETED',
        isDeleted: false,
        completedAt: between(ctx),
      }),
    }),
    ResidentCareTaskCompletion.count({
      where: withLoc(ctx, 'propertyId', {
        completedBy: ctx.userId,
        status: 'CANCELLED',
        isDeleted: false,
        completedAt: between(ctx),
      }),
    }),
    ResidentCareTaskCompletion.count({
      where: withLoc(ctx, 'propertyId', { completedBy: ctx.userId, isDeleted: false, completedAt: between(ctx) }),
      distinct: true,
      col: 'residentId',
    }),
    CareTaskAssignment.count({
      where: withLoc(ctx, 'propertyId', { nurseId: ctx.userId, status: 'ACTIVE', isDeleted: false }),
    }),
  ])
  return { completed, cancelled, residentsServed: residents, activeAssignments }
}

async function careRecords(ctx: ActivityContext, status?: string) {
  const where: Record<string, unknown> = { completedBy: ctx.userId, isDeleted: false, completedAt: between(ctx) }
  if (status) where.status = status

  const { rows, count } = await ResidentCareTaskCompletion.findAndCountAll({
    where: withLoc(ctx, 'propertyId', where),
    include: [residentInclude, { model: CareTask, as: 'task', attributes: ['id', 'careTaskName'] }],
    order: [['completedAt', 'DESC']],
    limit: ctx.limit,
    offset: (ctx.page - 1) * ctx.limit,
    distinct: true,
  })

  return paged(
    ctx,
    rows.map((c) => ({
      id: c.id,
      type: 'care-task' as const,
      title: c.task?.careTaskName ?? 'Care task',
      status: c.status,
      residentName: residentName(c.resident),
      unitNumber: c.resident?.unit?.unit_number ?? null,
      at: c.completedAt,
      notes: c.remarks || c.description || null,
    })),
    count,
  )
}

// ── Medical: doctors ────────────────────────────────────────────────────────

async function doctorSummary(ctx: ActivityContext) {
  const apptWhere = withLoc(ctx, 'locationId', {
    doctorId: ctx.userId,
    isDeleted: false,
    appointmentDate: betweenDays(ctx),
  })
  const [grouped, labReports, medications] = await Promise.all([
    DoctorAppointment.count({ where: apptWhere, group: ['status'] }) as unknown as Promise<
      Array<{ status: string; count: number }>
    >,
    ResidentLabReport.count({
      where: withLoc(ctx, 'locationId', { createdBy: ctx.userId, isDeleted: false, createdAt: between(ctx) }),
    }),
    ResidentMedication.count({
      where: withLoc(ctx, 'locationId', { createdBy: ctx.userId, isDeleted: false, createdAt: between(ctx) }),
    }),
  ])
  const byStatus = Object.fromEntries(grouped.map((r) => [r.status, r.count]))
  return {
    appointments: grouped.reduce((sum, r) => sum + r.count, 0),
    attended: byStatus[AppointmentStatus.ATTENDED] ?? 0,
    upcoming: (byStatus[AppointmentStatus.CONFIRMED] ?? 0) + (byStatus[AppointmentStatus.PENDING] ?? 0),
    missed: (byStatus[AppointmentStatus.CANCELLED] ?? 0) + (byStatus[AppointmentStatus.NO_SHOW] ?? 0),
    labReports,
    medications,
  }
}

async function doctorRecords(ctx: ActivityContext, status?: string) {
  const where: Record<string, unknown> = { doctorId: ctx.userId, isDeleted: false, appointmentDate: betweenDays(ctx) }
  if (status) where.status = status

  const { rows, count } = await DoctorAppointment.findAndCountAll({
    where: withLoc(ctx, 'locationId', where),
    include: [residentInclude],
    order: [
      ['appointmentDate', 'DESC'],
      ['slotTimeRange', 'DESC'],
    ],
    limit: ctx.limit,
    offset: (ctx.page - 1) * ctx.limit,
    distinct: true,
  })

  return paged(
    ctx,
    rows.map((a) => {
      const json = a.toJSON() as DoctorAppointment & { resident?: Resident }
      return {
        id: json.id,
        type: 'appointment' as const,
        title: 'Consultation',
        status: json.status,
        residentName: residentName(json.resident),
        unitNumber: json.resident?.unit?.unit_number ?? null,
        at: json.attendedAt ?? json.appointmentDate,
        appointmentDate: json.appointmentDate,
        slotTimeRange: json.slotTimeRange,
        notes: json.notes,
      }
    }),
    count,
  )
}

// ── Work log (every employee) ───────────────────────────────────────────────

const ACTIVITY_LABELS: Record<string, string> = {
  CREATED: 'Raised a ticket',
  APPROVED: 'Approved a ticket',
  ASSIGNED: 'Assigned a ticket',
  STATUS_CHANGE: 'Updated status',
  COMMENT_ADDED: 'Added a comment',
  ATTACHMENT_ADDED: 'Added an attachment',
  PRIORITY_CHANGE: 'Changed priority',
  UPDATED: 'Updated a ticket',
}

const STATUS_CHANGE_LABELS: Record<string, string> = {
  IN_PROGRESS: 'Started work',
  ON_HOLD: 'Put work on hold',
  RESOLVED: 'Completed work',
  CLOSED: 'Closed the ticket',
  CANCELLED: 'Cancelled the ticket',
  OPEN: 'Reopened the ticket',
}

/** Labels for what someone else did to the employee's ticket, worded from the employee's side. */
const receivedActionLabel = (log: TicketActivityLog) => {
  if (log.activityType === 'ASSIGNED') return 'Was assigned a ticket'
  switch (log.toStatus) {
    case 'CLOSED':
      return 'Work verified & closed'
    case 'CANCELLED':
      return 'Ticket was cancelled'
    case 'RESOLVED':
      return 'Marked as completed'
    case 'ON_HOLD':
      return 'Ticket put on hold'
    case 'IN_PROGRESS':
    case 'OPEN':
      return log.fromStatus === 'RESOLVED' || log.fromStatus === 'CLOSED' ? 'Ticket was reopened' : 'Status changed'
    default:
      return 'Status changed'
  }
}

const ticketActionLabel = (log: TicketActivityLog) => {
  if (log.activityType !== 'STATUS_CHANGE' || !log.toStatus) {
    return ACTIVITY_LABELS[log.activityType] ?? humanize(log.activityType)
  }
  if (log.toStatus === 'IN_PROGRESS' && log.fromStatus === 'ON_HOLD') return 'Resumed work'
  return STATUS_CHANGE_LABELS[log.toStatus] ?? 'Updated status'
}

/** Comments the apps write automatically say nothing the action label doesn't. */
const AUTO_COMMENTS = ['staff started work order', 'ticket assigned to employee', 'work order completed by staff']
const cleanNote = (comment?: string | null) => {
  if (!comment) return null
  const note = comment
    .replace(/Invoice:\s*N\/A,?\s*/i, '')
    .replace(/Amount:\s*N\/A/i, '')
    .trim()
    .replace(/[.,\s]+$/, '')
  if (!note || AUTO_COMMENTS.includes(note.toLowerCase()) || /^work verified by /i.test(note)) return null
  return note
}

const humanize = (value?: string | null) =>
  value
    ? value
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/^\w/, (c) => c.toUpperCase())
    : ''

const gateSubtitle = (e: GateEntry) => {
  const unit = (e as GateEntry & { unit?: PropertyUnit }).unit?.unit_number
  return [e.visitorType, unit ? `Unit ${unit}` : null].filter(Boolean).join(' · ') || null
}

/**
 * One timeline built from every module that records who did the work. Each
 * source fetches at most `page * limit` rows, so the merged slice for the
 * requested page is exact without a cross-table UNION.
 */
async function workLog(ctx: ActivityContext) {
  const take = ctx.page * ctx.limit + 1
  const range = between(ctx)

  const [
    ticketLogs,
    raisedPasses,
    approvals,
    checkIns,
    checkOuts,
    deliveries,
    careDone,
    appointments,
    labReports,
    medications,
  ] = await Promise.all([
    // The employee's own ticket actions, plus tickets handed to them by others.
    TicketActivityLog.findAll({
      where: {
        createdAt: range,
        [Op.or]: [
          { performedByUserId: ctx.userId },
          // What others (admins) did to this employee's tickets: assigning,
          // verifying and closing, cancelling, reopening.
          {
            activityType: ['ASSIGNED', 'STATUS_CHANGE'],
            performedByUserId: { [Op.ne]: ctx.userId },
            [Op.or]: [{ '$ticket.assignedToUserId$': ctx.userId }, { '$ticket.completedByUserId$': ctx.userId }],
          },
        ],
      },
      include: [
        {
          model: Ticket,
          as: 'ticket',
          attributes: ['id', 'ticketNumber', 'title', 'locId', 'assignedToUserId', 'completedByUserId'],
          required: true,
          ...(ctx.locId ? { where: { locId: ctx.locId } } : {}),
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: take,
    }),
    GateEntry.findAll({
      attributes: ['id', 'visitorName', 'visitorType', 'createdAt'],
      where: withLoc(ctx, 'locId', { createdBy: ctx.userId, entrySource: 'Walkin', createdAt: range }),
      include: [{ model: PropertyUnit, as: 'unit', attributes: ['unit_number'] }],
      order: [['createdAt', 'DESC']],
      limit: take,
    }),
    GateEntry.findAll({
      attributes: ['id', 'visitorName', 'visitorType', 'status', 'approvedAt'],
      where: withLoc(ctx, 'locId', { approvedBy: ctx.userId, approvedAt: range }),
      include: [{ model: PropertyUnit, as: 'unit', attributes: ['unit_number'] }],
      order: [['approvedAt', 'DESC']],
      limit: take,
    }),
    GateEntry.findAll({
      attributes: ['id', 'visitorName', 'visitorType', 'clockedInAt', 'approverType', 'approverName', 'approvedBy'],
      where: withLoc(ctx, 'locId', { clockedInBy: ctx.userId, clockedInAt: range }),
      include: [{ model: PropertyUnit, as: 'unit', attributes: ['unit_number'] }],
      order: [['clockedInAt', 'DESC']],
      limit: take,
    }),
    GateEntry.findAll({
      attributes: ['id', 'visitorName', 'visitorType', 'clockedOutAt'],
      where: withLoc(ctx, 'locId', { clockedOutBy: ctx.userId, clockedOutAt: range }),
      include: [{ model: PropertyUnit, as: 'unit', attributes: ['unit_number'] }],
      order: [['clockedOutAt', 'DESC']],
      limit: take,
    }),
    FnbFoodDelivery.findAll({
      where: withLoc(ctx, 'locId', {
        employeeId: ctx.userId,
        deliveryStatus: ['delivered', 'failed'],
        updatedAt: range,
      }),
      include: [{ model: FnbResidentOrder, as: 'order', attributes: ['id'], include: [residentInclude] }],
      order: [['updatedAt', 'DESC']],
      limit: take,
    }),
    ResidentCareTaskCompletion.findAll({
      where: withLoc(ctx, 'propertyId', { completedBy: ctx.userId, isDeleted: false, completedAt: range }),
      include: [residentInclude, { model: CareTask, as: 'task', attributes: ['careTaskName'] }],
      order: [['completedAt', 'DESC']],
      limit: take,
    }),
    DoctorAppointment.findAll({
      where: withLoc(ctx, 'locationId', {
        doctorId: ctx.userId,
        isDeleted: false,
        status: AppointmentStatus.ATTENDED,
        attendedAt: range,
      }),
      include: [residentInclude],
      order: [['attendedAt', 'DESC']],
      limit: take,
    }),
    ResidentLabReport.findAll({
      where: withLoc(ctx, 'locationId', { createdBy: ctx.userId, isDeleted: false, createdAt: range }),
      include: [residentInclude, { model: LabTestSetting, as: 'labTestSetting', attributes: ['name'] }],
      order: [['createdAt', 'DESC']],
      limit: take,
    }),
    ResidentMedication.findAll({
      where: withLoc(ctx, 'locationId', { createdBy: ctx.userId, isDeleted: false, createdAt: range }),
      include: [residentInclude],
      order: [['createdAt', 'DESC']],
      limit: take,
    }),
  ])

  const residentLine = (r?: Resident | null) => {
    const name = residentName(r)
    const unit = r?.unit?.unit_number
    return [name, unit ? `Unit ${unit}` : null].filter(Boolean).join(' · ') || null
  }

  const events: WorkLogEvent[] = [
    ...ticketLogs.map((l) => {
      const ticket = (l as TicketActivityLog & { ticket?: Ticket }).ticket
      const received = l.performedByUserId !== ctx.userId
      const isStatusChange = l.activityType === 'STATUS_CHANGE' && !!l.toStatus && l.fromStatus !== l.toStatus
      return {
        id: `ticket-log-${l.id}`,
        at: (l as unknown as { createdAt: Date }).createdAt,
        module: 'ticket' as const,
        action: received ? receivedActionLabel(l) : ticketActionLabel(l),
        title: ticket?.title ?? 'Ticket',
        subtitle: null,
        code: ticket?.ticketNumber ?? null,
        fromStatus: isStatusChange ? l.fromStatus : null,
        toStatus: isStatusChange ? l.toStatus : null,
        note: cleanNote(l.comment),
        actor: received ? l.performedByName || 'an admin' : null,
        refId: l.ticketId,
      }
    }),
    ...raisedPasses.map((e) => ({
      id: `gate-raised-${e.id}`,
      at: e.createdAt as Date,
      module: 'gate' as const,
      action: 'Raised a gate pass',
      title: e.visitorName,
      subtitle: gateSubtitle(e),
      note: 'Sent to the resident for approval',
      refId: e.id,
    })),
    ...approvals.map((e) => ({
      id: `gate-approval-${e.id}`,
      at: e.approvedAt as Date,
      module: 'gate' as const,
      action: e.status === 'Rejected' ? 'Rejected visitor' : 'Approved visitor',
      title: e.visitorName,
      subtitle: gateSubtitle(e),
      refId: e.id,
    })),
    ...checkIns.map((e) => ({
      id: `gate-in-${e.id}`,
      at: e.clockedInAt as Date,
      module: 'gate' as const,
      action: 'Checked in visitor',
      title: e.visitorName,
      subtitle: gateSubtitle(e),
      // Who approved the visitor, when it was someone else (usually the resident).
      note:
        e.approverType && e.approvedBy !== ctx.userId
          ? `Approved by ${e.approverName || 'unknown'} (${(APPROVER_LABELS[e.approverType] ?? e.approverType).toLowerCase()})`
          : null,
      refId: e.id,
    })),
    ...checkOuts.map((e) => ({
      id: `gate-out-${e.id}`,
      at: e.clockedOutAt as Date,
      module: 'gate' as const,
      action: 'Checked out visitor',
      title: e.visitorName,
      subtitle: gateSubtitle(e),
      refId: e.id,
    })),
    ...deliveries.map((d) => ({
      id: `fnb-${d.id}`,
      at: (d.deliveryStatus === 'delivered' && d.deliveredAt) || d.updatedAt,
      module: 'fnb' as const,
      action: d.deliveryStatus === 'delivered' ? 'Delivered order' : 'Delivery failed',
      title: residentLine(d.order?.resident) ?? 'Food order',
      subtitle: d.deliveryDate ? `For ${d.deliveryDate}` : null,
      refId: d.orderId,
    })),
    ...careDone.map((c) => ({
      id: `care-${c.id}`,
      at: c.completedAt,
      module: 'care' as const,
      action: c.status === 'COMPLETED' ? 'Completed care task' : 'Cancelled care task',
      title: c.task?.careTaskName ?? 'Care task',
      subtitle: residentLine(c.resident),
      refId: c.residentId,
    })),
    ...appointments.map((a) => ({
      id: `appt-${a.id}`,
      at: a.attendedAt as Date,
      module: 'clinical' as const,
      action: 'Attended consultation',
      title: residentLine((a as DoctorAppointment & { resident?: Resident }).resident) ?? 'Resident',
      subtitle: a.slotTimeRange || null,
      refId: a.residentId,
    })),
    ...labReports.map((r) => ({
      id: `lab-${r.id}`,
      at: r.createdAt as Date,
      module: 'clinical' as const,
      action: 'Uploaded lab report',
      title: r.labTestSetting?.name ?? 'Lab report',
      subtitle: residentLine(r.resident),
      refId: r.residentId,
    })),
    ...medications.map((m) => ({
      id: `med-${m.id}`,
      at: m.createdAt as Date,
      module: 'clinical' as const,
      action: 'Prescribed medication',
      title: m.medicineName,
      subtitle: residentLine(m.resident),
      refId: m.residentId,
    })),
  ]

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  const start = (ctx.page - 1) * ctx.limit
  return {
    rows: events.slice(start, start + ctx.limit),
    pagination: { page: ctx.page, limit: ctx.limit, hasMore: events.length > start + ctx.limit },
  }
}

// ── Handlers ────────────────────────────────────────────────────────────────

const summaryByKind: Record<Exclude<ActivityKind, 'none'>, (ctx: ActivityContext) => Promise<object>> = {
  tickets: ticketSummary,
  gate: gateSummary,
  fnb: fnbSummary,
  'medical-care': careSummary,
  'medical-doctor': doctorSummary,
}

const recordsByKind: Record<
  Exclude<ActivityKind, 'none'>,
  (ctx: ActivityContext, status?: string) => Promise<object>
> = {
  tickets: ticketRecords,
  gate: gateRecords,
  fnb: fnbRecords,
  'medical-care': careRecords,
  'medical-doctor': doctorRecords,
}

const fail = (res: Response, err: unknown) =>
  res.status(500).json({ success: false, message: err instanceof Error ? err.message : 'Unknown error' })

export async function getEmployeeActivitySummary(req: Request, res: Response): Promise<void> {
  try {
    const ctx = buildContext(req)
    const resolved = await resolveKind(ctx.userId, ctx.locId)
    const stats = resolved.kind === 'none' ? null : await summaryByKind[resolved.kind](ctx)
    res.status(200).json({
      success: true,
      data: { ...resolved, range: { from: toDateOnly(ctx.from), to: toDateOnly(ctx.to) }, stats },
    })
  } catch (err) {
    fail(res, err)
  }
}

export async function getEmployeeActivityRecords(req: Request, res: Response): Promise<void> {
  try {
    const ctx = buildContext(req)
    const { kind } = await resolveKind(ctx.userId, ctx.locId)
    const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined
    const data = kind === 'none' ? paged(ctx, [], 0) : await recordsByKind[kind](ctx, status)
    res.status(200).json({ success: true, data: { kind, ...data } })
  } catch (err) {
    fail(res, err)
  }
}

export async function getEmployeeWorkLog(req: Request, res: Response): Promise<void> {
  try {
    res.status(200).json({ success: true, data: await workLog(buildContext(req)) })
  } catch (err) {
    fail(res, err)
  }
}
