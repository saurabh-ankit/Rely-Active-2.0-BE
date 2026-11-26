import type { Response } from 'express'
import { Op, type Transaction, type WhereOptions } from 'sequelize'
import sequelize from '../../../config/db/index.js'
import {
  Department,
  JobCategory,
  Property,
  PropertyUnit,
  Resident,
  Ticket,
  TicketActivityLog,
  TicketTatHistory,
  User,
  UserDetail,
  UserLocation,
} from '../../../models/index.js'
import { TicketActivityType, TicketCategory, TicketStatus } from '../../../enums/ticket.enum.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { HttpError } from '../../../middlewares/error/http-error.js'
import {
  applyWorkDetails,
  getWorkDetailFiles,
  getWorkDetails,
  normalizeAttachments,
  toAmount,
  uploadWorkFiles,
  type WorkDetailsInput,
} from '../../../services/ticketWork.service.js'
import { AuthorizationService } from '../../../services/authorization.service.js'
import { resolveNotificationActor } from '../../../services/notifications/notificationAudience.service.js'
import { buildTatUpdatedNotificationContent } from '../../../services/notifications/ticketNotificationContent.service.js'
import { publishTicketNotificationSafe } from '../../../services/notifications/ticketNotification.service.js'
import {
  acceptOffer,
  findOpenOfferForStaff,
  listOffersForStaff,
  rejectOffer,
} from '../../../services/ticketAutoAssign.service.js'
import {
  type AcceptTicketOfferInput,
  type RejectTicketOfferInput,
  isCustomTatOption,
  staffTicketListQuerySchema,
  type AddTicketWorkDetailsInput,
  type CompleteTicketInput,
  type UpdateTicketTatInput,
} from '../../../validations/ticketStaff.validation.js'

// ── Access control ──────────────────────────────────────────────────────────

type StaffTicketDepartment = 'RNM' | 'CON'

const DEPARTMENT_TICKET_CATEGORIES: Record<StaffTicketDepartment, string[]> = {
  RNM: [TicketCategory.REPAIR_MAINTENANCE],
  CON: [TicketCategory.CONCIERGE],
}

/** Maps a department to the L3 ticket workflow it belongs to, if any. */
function resolveStaffTicketDepartment(name?: string | null, code?: string | null): StaffTicketDepartment | null {
  const codeUpper = (code || '').toUpperCase()
  const nameUpper = (name || '').toUpperCase()
  if (
    codeUpper === 'RNM' ||
    nameUpper.includes('REPAIR') ||
    nameUpper.includes('MAINTENANCE') ||
    nameUpper.includes('R&M')
  ) {
    return 'RNM'
  }
  if (codeUpper === 'CON' || nameUpper.includes('CONCIERGE')) {
    return 'CON'
  }
  return null
}

interface StaffTicketContext {
  userId: string
  staffName: string
  departmentIds: string[]
  categories: string[]
  departmentIdsByType: Record<StaffTicketDepartment, string[]>
}

function getDisplayName(user: (User & { profile?: UserDetail | null }) | null | undefined, fallback: string): string {
  if (!user) return fallback
  const fullName = `${user.profile?.firstName || ''} ${user.profile?.lastName || ''}`.trim()
  return fullName || user.username || fallback
}

/**
 * Resolves the logged-in user's Repair & Maintenance / Concierge scope.
 * Throws 401/403 when the caller is not an L3 staff member of those departments.
 */
async function getStaffTicketContext(req: AuthenticatedRequest): Promise<StaffTicketContext> {
  const userId = req.user?.id
  if (!userId || req.user?.residentId) {
    throw new HttpError(401, 'Staff authentication required')
  }

  const authCtx = await AuthorizationService.getUserAuthorizationContext(userId)
  if (authCtx.isSuperAdmin) {
    throw new HttpError(403, 'Super Admin accounts cannot perform L3 staff ticket actions')
  }

  const staffUser = (await User.findByPk(userId, {
    include: [
      { model: UserDetail, as: 'profile' },
      {
        model: UserLocation,
        as: 'userLocations',
        where: { isActive: true, isDeleted: false },
        required: false,
        include: [{ model: Department, as: 'department' }],
      },
    ],
  })) as (User & { profile?: UserDetail; userLocations?: Array<UserLocation & { department?: Department }> }) | null

  const departmentIds = new Set<string>()
  const categories = new Set<string>()
  const departmentIdsByType: Record<StaffTicketDepartment, string[]> = { RNM: [], CON: [] }
  for (const userLocation of staffUser?.userLocations || []) {
    const dept = userLocation.department
    if (!dept || dept.isActive === false) continue
    const staffDept = resolveStaffTicketDepartment(dept.name, dept.code)
    if (!staffDept) continue
    departmentIds.add(dept.id)
    departmentIdsByType[staffDept].push(dept.id)
    DEPARTMENT_TICKET_CATEGORIES[staffDept].forEach((c) => categories.add(c))
  }

  if (departmentIds.size === 0) {
    throw new HttpError(403, 'Access restricted to Repair & Maintenance and Concierge staff')
  }

  return {
    userId,
    staffName: getDisplayName(staffUser, 'Staff'),
    departmentIds: [...departmentIds],
    categories: [...categories],
    departmentIdsByType,
  }
}

/** Narrows the staff scope to one department, e.g. when the R&M dashboard lists tickets. */
function narrowToDepartment(ctx: StaffTicketContext, department: StaffTicketDepartment): StaffTicketContext {
  const departmentIds = ctx.departmentIdsByType[department]
  if (departmentIds.length === 0) {
    throw new HttpError(
      403,
      `You are not assigned to the ${department === 'RNM' ? 'Repair & Maintenance' : 'Concierge'} department`,
    )
  }
  return { ...ctx, departmentIds, categories: DEPARTMENT_TICKET_CATEGORIES[department] }
}

/** Tickets assigned to the staff member that belong to one of their departments. */
function buildAssignedTicketScope(ctx: StaffTicketContext): WhereOptions {
  return {
    assignedToUserId: ctx.userId,
    [Op.or]: [
      { departmentId: { [Op.in]: ctx.departmentIds } },
      { departmentId: null, category: { [Op.in]: ctx.categories } },
    ],
  }
}

async function findAssignedTicketForUpdate(
  ticketId: string,
  ctx: StaffTicketContext,
  transaction: Transaction,
): Promise<Ticket> {
  const ticket = await Ticket.findByPk(ticketId, { transaction, lock: transaction.LOCK.UPDATE })
  if (!ticket) {
    throw new HttpError(404, 'Ticket not found')
  }
  assertTicketAccess(ticket, ctx)
  return ticket
}

function assertTicketAccess(ticket: Ticket, ctx: StaffTicketContext): void {
  if (ticket.assignedToUserId !== ctx.userId) {
    throw new HttpError(403, 'This ticket is not assigned to you')
  }
  assertTicketDepartment(ticket, ctx)
}

function assertTicketDepartment(ticket: Ticket, ctx: StaffTicketContext): void {
  const inDepartment = ticket.departmentId
    ? ctx.departmentIds.includes(ticket.departmentId)
    : ctx.categories.includes(String(ticket.category))
  if (!inDepartment) {
    throw new HttpError(403, 'This ticket does not belong to your department')
  }
}

// ── Status transitions ──────────────────────────────────────────────────────

const START_WORK_FROM: TicketStatus[] = [TicketStatus.OPEN, TicketStatus.ON_HOLD]
const TAT_UPDATE_ALLOWED: TicketStatus[] = [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD]
const WORK_DETAILS_ALLOWED: TicketStatus[] = [TicketStatus.IN_PROGRESS]
const COMPLETE_FROM: TicketStatus[] = [TicketStatus.IN_PROGRESS]

/**
 * Tickets assigned before the staff start step existed were moved straight to
 * IN_PROGRESS on assignment, without a start time. They still need "Start Work".
 */
function isAwaitingStart(ticket: Ticket): boolean {
  return ticket.status === TicketStatus.IN_PROGRESS && !ticket.workStartedAt
}

/** Work details and completion are only accepted after the staff member has started the work. */
function assertWorkStarted(ticket: Ticket): void {
  if (isAwaitingStart(ticket)) {
    throw new HttpError(409, 'Start work on this ticket before completing it', {
      currentStatus: ticket.status,
    })
  }
}

function assertStatus(ticket: Ticket, allowed: TicketStatus[], action: string): void {
  if (!allowed.includes(ticket.status)) {
    throw new HttpError(409, `Cannot ${action} a ticket that is ${ticket.status}`, {
      currentStatus: ticket.status,
      allowedStatuses: allowed,
    })
  }
}

// ── Response helpers ────────────────────────────────────────────────────────

interface RequestMedia {
  notes: string | null
  photos: string[]
  voiceNotes: string[]
}

const AUDIO_URL = /\.(m4a|aac|mp3|wav|ogg|oga|opus|3gp|amr|webm|caf)(\?|$)/i
const VOICE_PATH = /voice[-_]?note|\/audio\/|recording/i

/**
 * What the resident attached when raising the ticket. Attachments come in
 * several shapes across app versions: a bare array of URLs, `{photos, audioUrl,
 * notes}`, or voice notes mixed in with photos (older web tickets). The staff
 * member's own `workDetails` are left out.
 */
function getRequestMedia(attachments: Ticket['attachments']): RequestMedia {
  const media: RequestMedia = { notes: null, photos: [], voiceNotes: [] }
  const raw = normalizeAttachments(attachments)

  const add = (value: unknown, audioHint: boolean): void => {
    if (!value) return
    if (Array.isArray(value)) {
      value.forEach((v) => add(v, audioHint))
      return
    }
    if (typeof value === 'object') {
      add((value as { url?: unknown }).url, audioHint)
      return
    }
    if (typeof value !== 'string') return
    const url = value.trim()
    if (!/^https?:\/\//i.test(url)) return
    const isAudio = audioHint || AUDIO_URL.test(url) || (/\.mp4(\?|$)/i.test(url) && VOICE_PATH.test(url))
    const list = isAudio ? media.voiceNotes : media.photos
    if (!list.includes(url)) list.push(url)
  }

  for (const [key, value] of Object.entries(raw)) {
    if (key === 'workDetails' || key === 'completion') continue
    if (key === 'notes' && typeof value === 'string') {
      media.notes = value.trim() || null
      continue
    }
    add(value, /audio|voice/i.test(key))
  }
  return media
}

function formatTimeAgo(date: Date | string | null | undefined): string {
  if (!date) return 'Just now'
  const diffMinutes = Math.max(1, Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60)))
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return `${Math.floor(diffHours / 24)}d ago`
}

const ticketIncludes = [
  { model: PropertyUnit, as: 'unit', required: false },
  { model: Property, as: 'property', required: false },
  { model: Resident, as: 'resident', required: false },
  { model: Department, as: 'department', required: false },
  { model: JobCategory, as: 'jobCategory', required: false },
  { model: User, as: 'assignedToUser', include: [{ model: UserDetail, as: 'profile' }], required: false },
  { model: User, as: 'workStartedByUser', include: [{ model: UserDetail, as: 'profile' }], required: false },
  { model: User, as: 'completedByUser', include: [{ model: UserDetail, as: 'profile' }], required: false },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatStaffTicket(t: any) {
  const unitNumber = t.unit?.unit_number || t.unit?.unitNumber || t.unit?.name || null
  const blockNumber = t.unit?.block_number || t.unit?.blockNumber || t.unit?.block || null
  const unit = unitNumber
    ? blockNumber
      ? `Tower ${blockNumber} - Flat ${unitNumber}`
      : `Flat ${unitNumber}`
    : 'Common Area'
  const residentName = t.resident
    ? `${t.resident.firstName || ''} ${t.resident.lastName || ''}`.trim() || t.resident.email || 'Resident'
    : 'Facility Resident'

  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    title: t.title,
    description: t.description || '',
    category: t.category,
    jobCategory: t.jobCategory?.name || null,
    departmentId: t.departmentId,
    departmentName: t.department?.name || null,
    priority: t.priority,
    // Closed without completion is CANCELLED internally; the staff app shows it as closed, with the reason
    status: t.status === TicketStatus.CANCELLED ? TicketStatus.CLOSED : t.status,
    closedWithoutCompletion: t.status === TicketStatus.CANCELLED,
    closeReason: t.closeReason || null,
    unit,
    unitNumber,
    blockNumber,
    residentName,
    residentPhone: t.resident?.phone || null,
    assignedToUserId: t.assignedToUserId,
    assignedToName: t.assignedToUser ? getDisplayName(t.assignedToUser, 'Staff') : 'Unassigned',
    tat: {
      option: t.tatOption || null,
      deadline: t.customTatDeadline || null,
    },
    // Accepted from an auto-assign offer (shown with an "Auto" tag)
    isAutoAssigned: t.autoAssignStatus === 'ASSIGNED',
    autoAssignStatus: t.autoAssignStatus || null,
    workStartedAt: t.workStartedAt || null,
    workStartedBy: t.workStartedByUserId
      ? { userId: t.workStartedByUserId, name: getDisplayName(t.workStartedByUser, 'Staff') }
      : null,
    completedAt: t.completedAt || null,
    completedBy: t.completedByUserId
      ? { userId: t.completedByUserId, name: getDisplayName(t.completedByUser, 'Staff') }
      : null,
    invoiceAmount: toAmount(t.invoiceAmount),
    workDetails: getWorkDetails(t.attachments),
    requestMedia: getRequestMedia(t.attachments),
    resolvedAt: t.resolvedAt || null,
    resolutionNotes: t.resolutionNotes || null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    timeAgo: formatTimeAgo(t.createdAt),
  }
}

function formatTatHistory(entry: TicketTatHistory) {
  return {
    id: entry.id,
    previousTat: { option: entry.previousTatOption, deadline: entry.previousTatDeadline },
    updatedTat: { option: entry.updatedTatOption, deadline: entry.updatedTatDeadline },
    note: entry.note,
    changedBy: { userId: entry.changedByUserId, name: entry.changedByName },
    changedAt: entry.changedAt,
  }
}

function sendError(res: Response, err: unknown, logLabel: string): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      success: false,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    })
    return
  }
  console.error(logLabel, err)
  res.status(500).json({ success: false, message: err instanceof Error ? err.message : 'Unknown error' })
}

// ── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/mobile/l3/tickets
 * Tickets assigned to the logged-in Repair & Maintenance / Concierge staff member.
 * Query: status (ALL|ACTIVE|OPEN|IN_PROGRESS|ON_HOLD|RESOLVED|CLOSED), search, department (RNM|CON), page, limit
 */
export async function getStaffTickets(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const staffCtx = await getStaffTicketContext(req)

    const parsedQuery = staffTicketListQuerySchema.safeParse(req.query)
    if (!parsedQuery.success) {
      const issue = parsedQuery.error.issues[0]
      throw new HttpError(400, issue ? issue.message : 'Invalid query parameters')
    }
    const { status, search, department, page, limit } = parsedQuery.data
    const ctx = department ? narrowToDepartment(staffCtx, department) : staffCtx

    const scope = buildAssignedTicketScope(ctx)
    const filters: WhereOptions[] = [scope]

    if (status && status !== 'ALL') {
      // "Active" is work still to be finished; "Resolved" also covers tickets that were later closed.
      const statusGroups: Partial<Record<typeof status, TicketStatus[]>> = {
        ACTIVE: [TicketStatus.OPEN, TicketStatus.ON_HOLD, TicketStatus.IN_PROGRESS],
        RESOLVED: [TicketStatus.RESOLVED, TicketStatus.CLOSED],
        CLOSED: [TicketStatus.CLOSED, TicketStatus.CANCELLED],
      }
      filters.push({ status: statusGroups[status] ?? status })
    }

    if (search) {
      const q = `%${search}%`
      filters.push({
        [Op.or]: [{ ticketNumber: { [Op.like]: q } }, { title: { [Op.like]: q } }, { description: { [Op.like]: q } }],
      })
    }

    const [{ rows, count }, statusCounts] = await Promise.all([
      Ticket.findAndCountAll({
        where: { [Op.and]: filters },
        include: ticketIncludes,
        order: [['createdAt', 'DESC']],
        limit,
        offset: (page - 1) * limit,
        distinct: true,
      }),
      Ticket.findAll({
        where: scope,
        attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['status'],
        raw: true,
      }) as unknown as Promise<Array<{ status: TicketStatus; count: number | string }>>,
    ])

    const summary: Record<string, number> = Object.fromEntries(Object.values(TicketStatus).map((s) => [s, 0]))
    for (const row of statusCounts) {
      summary[row.status] = Number(row.count)
    }

    res.status(200).json({
      success: true,
      message: 'Assigned tickets retrieved successfully',
      data: rows.map(formatStaffTicket),
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
      summary,
    })
  } catch (err: unknown) {
    sendError(res, err, 'Error fetching L3 staff tickets:')
  }
}

/**
 * GET /api/v1/mobile/l3/tickets/:id
 * Ticket details with TAT history and activity log. Only the assigned staff member can view it,
 * or the staff member an auto-assign offer is waiting on (the response then carries `offer`).
 */
export async function getStaffTicketById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ctx = await getStaffTicketContext(req)
    const id = req.params.id as string

    const ticket = await Ticket.findByPk(id, { include: ticketIncludes })
    if (!ticket) {
      throw new HttpError(404, 'Ticket not found')
    }

    // A ticket auto-assign is offering to this staff member: they can view it before accepting
    const offer =
      ticket.assignedToUserId !== ctx.userId && ticket.offeredToUserId === ctx.userId
        ? await findOpenOfferForStaff(ticket.id, ctx.userId)
        : null
    if (offer) {
      assertTicketDepartment(ticket, ctx)
    } else {
      assertTicketAccess(ticket, ctx)
    }

    const [tatHistory, activityLogs] = await Promise.all([
      TicketTatHistory.findAll({ where: { ticketId: id }, order: [['changedAt', 'DESC']] }),
      TicketActivityLog.findAll({ where: { ticketId: id }, order: [['createdAt', 'DESC']] }),
    ])

    res.status(200).json({
      success: true,
      data: {
        ...formatStaffTicket(ticket),
        tatHistory: tatHistory.map(formatTatHistory),
        activityLogs,
        // Set while the ticket is waiting for this staff member to accept (with a TAT) or reject
        offer: offer ? { attemptId: offer.id, offeredAt: offer.offeredAt, expiresAt: offer.expiresAt } : null,
      },
      serverTime: new Date().toISOString(),
    })
  } catch (err: unknown) {
    sendError(res, err, 'Error fetching L3 staff ticket details:')
  }
}

/**
 * POST /api/v1/mobile/l3/tickets/:id/start-work
 * OPEN / ON_HOLD → IN_PROGRESS. Records who started the work and when.
 */
export async function startWork(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ctx = await getStaffTicketContext(req)
    const id = req.params.id as string

    const ticket = await sequelize.transaction(async (transaction) => {
      const t = await findAssignedTicketForUpdate(id, ctx, transaction)
      if (!isAwaitingStart(t)) {
        assertStatus(t, START_WORK_FROM, 'start work on')
      }

      const previousStatus = t.status
      const startedAt = new Date()

      t.status = TicketStatus.IN_PROGRESS
      t.workStartedAt = startedAt
      t.workStartedByUserId = ctx.userId
      t.updatedBy = ctx.userId
      await t.save({ transaction })

      await TicketActivityLog.create(
        {
          ticketId: t.id,
          performedByUserId: ctx.userId,
          performedByName: ctx.staffName,
          activityType: TicketActivityType.STATUS_CHANGE,
          fromStatus: previousStatus,
          toStatus: TicketStatus.IN_PROGRESS,
          comment: `Work started by ${ctx.staffName}`,
          createdBy: ctx.userId,
        },
        { transaction },
      )
      return t
    })

    await publishTicketNotificationSafe({
      ticket,
      eventCode: 'TICKET_WORK_STARTED',
      title: 'Ticket work started',
      message: `${ticket.title || 'Ticket'} (${ticket.ticketNumber}) work has started.`,
      actor: resolveNotificationActor(req, ctx.staffName),
      payload: {
        status: ticket.status,
        workStartedAt: ticket.workStartedAt,
        workStartedByUserId: ctx.userId,
      },
    })

    res.status(200).json({
      success: true,
      message: 'Work started successfully',
      data: {
        id: ticket.id,
        status: ticket.status,
        workStartedAt: ticket.workStartedAt,
        workStartedBy: { userId: ctx.userId, name: ctx.staffName },
      },
    })
  } catch (err: unknown) {
    sendError(res, err, 'Error starting work on ticket:')
  }
}

/**
 * PATCH /api/v1/mobile/l3/tickets/:id/tat
 * Body: { tatOption?, customTatDeadline?, note }
 * Updates TAT and appends an audit entry with the previous and updated values.
 */
export async function updateTicketTat(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ctx = await getStaffTicketContext(req)
    const id = req.params.id as string
    const input = req.body as UpdateTicketTatInput

    const { ticket, history } = await sequelize.transaction(async (transaction) => {
      const t = await findAssignedTicketForUpdate(id, ctx, transaction)
      assertStatus(t, TAT_UPDATE_ALLOWED, 'update TAT on')

      const previousTatOption = t.tatOption || null
      const previousTatDeadline = t.customTatDeadline || null

      // A deadline on its own means a custom TAT; a preset option on its own clears any old deadline.
      const updatedTatOption = input.tatOption ?? 'Custom'
      const updatedTatDeadline = input.customTatDeadline ?? null
      if (updatedTatDeadline && !isCustomTatOption(updatedTatOption)) {
        throw new HttpError(400, 'customTatDeadline can only be set with the "Custom" TAT option')
      }

      const unchanged =
        updatedTatOption === previousTatOption &&
        (updatedTatDeadline?.getTime() ?? null) ===
          (previousTatDeadline ? new Date(previousTatDeadline).getTime() : null)
      if (unchanged) {
        throw new HttpError(400, 'Updated TAT is the same as the current TAT')
      }

      const changedAt = new Date()
      t.tatOption = updatedTatOption
      t.customTatDeadline = updatedTatDeadline
      t.updatedBy = ctx.userId
      await t.save({ transaction })

      const h = await TicketTatHistory.create(
        {
          ticketId: t.id,
          previousTatOption,
          previousTatDeadline,
          updatedTatOption,
          updatedTatDeadline,
          note: input.note,
          changedByUserId: ctx.userId,
          changedByName: ctx.staffName,
          changedAt,
          createdBy: ctx.userId,
        },
        { transaction },
      )

      await TicketActivityLog.create(
        {
          ticketId: t.id,
          performedByUserId: ctx.userId,
          performedByName: ctx.staffName,
          activityType: TicketActivityType.UPDATED,
          comment: `TAT updated: ${input.note}`,
          attachments: {
            tatHistoryId: h.id,
            previousTat: { option: previousTatOption, deadline: previousTatDeadline },
            updatedTat: { option: updatedTatOption, deadline: updatedTatDeadline },
          },
          createdBy: ctx.userId,
        },
        { transaction },
      )

      return { ticket: t, history: h }
    })

    const tatNotification = buildTatUpdatedNotificationContent({
      ticketTitle: ticket.title,
      ticketNumber: ticket.ticketNumber,
      updatedByName: ctx.staffName,
      previousTat: {
        option: history.previousTatOption,
        deadline: history.previousTatDeadline,
      },
      updatedTat: {
        option: history.updatedTatOption,
        deadline: history.updatedTatDeadline,
      },
      note: history.note,
    })

    await publishTicketNotificationSafe({
      ticket,
      eventCode: 'TICKET_TAT_UPDATED',
      title: tatNotification.title,
      message: tatNotification.message,
      actor: resolveNotificationActor(req, ctx.staffName),
      payload: {
        ...tatNotification.payload,
        previousTatOption: history.previousTatOption,
        previousTatDeadline: history.previousTatDeadline,
        updatedTatOption: history.updatedTatOption,
        updatedTatDeadline: history.updatedTatDeadline,
        note: history.note,
      },
    })

    res.status(200).json({
      success: true,
      message: 'TAT updated successfully',
      data: {
        id: ticket.id,
        status: ticket.status,
        tat: { option: ticket.tatOption, deadline: ticket.customTatDeadline },
        history: formatTatHistory(history),
      },
    })
  } catch (err: unknown) {
    sendError(res, err, 'Error updating ticket TAT:')
  }
}

/**
 * GET /api/v1/mobile/l3/tickets/:id/tat-history
 * TAT audit trail, newest first.
 */
export async function getTicketTatHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ctx = await getStaffTicketContext(req)
    const id = req.params.id as string

    const ticket = await Ticket.findByPk(id)
    if (!ticket) {
      throw new HttpError(404, 'Ticket not found')
    }
    assertTicketAccess(ticket, ctx)

    const history = await TicketTatHistory.findAll({ where: { ticketId: id }, order: [['changedAt', 'DESC']] })

    res.status(200).json({
      success: true,
      data: history.map(formatTatHistory),
    })
  } catch (err: unknown) {
    sendError(res, err, 'Error fetching ticket TAT history:')
  }
}

/**
 * Checks access and status before uploading (so rejected requests never reach S3),
 * then uploads. Callers must re-check the status under lock when saving.
 */
async function uploadWorkDetailFiles(
  req: AuthenticatedRequest,
  ctx: StaffTicketContext,
  allowed: TicketStatus[],
  action: string,
): Promise<Pick<WorkDetailsInput, 'photos' | 'voiceNotes'>> {
  const id = req.params.id as string
  const { photoFiles, voiceNoteFiles } = getWorkDetailFiles(req)

  const existing = await Ticket.findByPk(id)
  if (!existing) {
    throw new HttpError(404, 'Ticket not found')
  }
  assertTicketAccess(existing, ctx)
  assertStatus(existing, allowed, action)
  assertWorkStarted(existing)

  const [photos, voiceNotes] = await Promise.all([
    uploadWorkFiles(photoFiles, `tickets/${id}/photos`, ctx),
    uploadWorkFiles(voiceNoteFiles, `tickets/${id}/voice-notes`, ctx),
  ])
  return { photos, voiceNotes }
}

/**
 * POST /api/v1/mobile/l3/tickets/:id/work-details  (multipart/form-data)
 * Fields: invoiceAmount?; files: photos[] (images, max 10), voiceNotes[] (audio, max 5).
 * Only allowed while the ticket is IN_PROGRESS. Files are appended to existing work details.
 */
export async function addTicketWorkDetails(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ctx = await getStaffTicketContext(req)
    const id = req.params.id as string
    const { invoiceAmount } = req.body as AddTicketWorkDetailsInput

    const { photoFiles, voiceNoteFiles } = getWorkDetailFiles(req)
    if (invoiceAmount === undefined && photoFiles.length === 0 && voiceNoteFiles.length === 0) {
      throw new HttpError(400, 'Provide an invoice amount, photos or voice notes')
    }

    const uploaded = await uploadWorkDetailFiles(req, ctx, WORK_DETAILS_ALLOWED, 'add work details to')

    const ticket = await sequelize.transaction(async (transaction) => {
      const t = await findAssignedTicketForUpdate(id, ctx, transaction)
      assertStatus(t, WORK_DETAILS_ALLOWED, 'add work details to')

      await applyWorkDetails(t, ctx, { invoiceAmount, ...uploaded }, transaction)
      t.updatedBy = ctx.userId
      await t.save({ transaction })
      return t
    })

    await publishTicketNotificationSafe({
      ticket,
      eventCode: 'TICKET_WORK_DETAILS_ADDED',
      title: 'Ticket work details updated',
      message: `${ctx.staffName} added work details on ${ticket.title || 'ticket'} (${ticket.ticketNumber}).`,
      actor: resolveNotificationActor(req, ctx.staffName),
      payload: {
        invoiceAmount: toAmount(ticket.invoiceAmount),
        photosAdded: uploaded.photos.length,
        voiceNotesAdded: uploaded.voiceNotes.length,
      },
    })

    res.status(200).json({
      success: true,
      message: 'Work details added successfully',
      data: {
        id: ticket.id,
        status: ticket.status,
        invoiceAmount: toAmount(ticket.invoiceAmount),
        workDetails: getWorkDetails(ticket.attachments),
      },
    })
  } catch (err: unknown) {
    sendError(res, err, 'Error adding ticket work details:')
  }
}

/**
 * POST /api/v1/mobile/l3/tickets/:id/complete  (JSON or multipart/form-data)
 * Fields: notes?, invoiceAmount?; files: photos[] (images, max 10), voiceNotes[] (audio, max 5).
 * IN_PROGRESS → RESOLVED. Work details and completion are saved together, recording who completed the work and when.
 */
export async function completeTicket(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ctx = await getStaffTicketContext(req)
    const id = req.params.id as string
    const { notes, invoiceAmount } = req.body as CompleteTicketInput

    const uploaded = await uploadWorkDetailFiles(req, ctx, COMPLETE_FROM, 'complete')

    const ticket = await sequelize.transaction(async (transaction) => {
      const t = await findAssignedTicketForUpdate(id, ctx, transaction)
      assertStatus(t, COMPLETE_FROM, 'complete')
      assertWorkStarted(t)

      await applyWorkDetails(t, ctx, { invoiceAmount, ...uploaded }, transaction)

      // Written resolution notes are required; voice notes are optional.
      if (!notes?.trim()) {
        throw new HttpError(400, 'Resolution notes are required to complete the ticket')
      }

      const previousStatus = t.status
      const completedAt = new Date()

      t.status = TicketStatus.RESOLVED
      t.completedAt = completedAt
      t.completedByUserId = ctx.userId
      t.resolvedAt = completedAt
      if (notes !== undefined) {
        t.resolutionNotes = notes
      }
      t.updatedBy = ctx.userId
      await t.save({ transaction })

      await TicketActivityLog.create(
        {
          ticketId: t.id,
          performedByUserId: ctx.userId,
          performedByName: ctx.staffName,
          activityType: TicketActivityType.STATUS_CHANGE,
          fromStatus: previousStatus,
          toStatus: TicketStatus.RESOLVED,
          comment: notes ? `Work completed by ${ctx.staffName}: ${notes}` : `Work completed by ${ctx.staffName}`,
          createdBy: ctx.userId,
        },
        { transaction },
      )
      return t
    })

    await publishTicketNotificationSafe({
      ticket,
      eventCode: 'TICKET_RESOLVED',
      title: 'Ticket resolved',
      message: `${ticket.title || 'Ticket'} (${ticket.ticketNumber}) was marked completed by ${ctx.staffName}.`,
      actor: resolveNotificationActor(req, ctx.staffName),
      payload: {
        status: ticket.status,
        completedAt: ticket.completedAt,
        completedByUserId: ctx.userId,
        notes: notes || null,
      },
    })

    res.status(200).json({
      success: true,
      message: 'Ticket completed successfully',
      data: {
        id: ticket.id,
        status: ticket.status,
        completedAt: ticket.completedAt,
        completedBy: { userId: ctx.userId, name: ctx.staffName },
        resolutionNotes: ticket.resolutionNotes,
        invoiceAmount: toAmount(ticket.invoiceAmount),
        workDetails: getWorkDetails(ticket.attachments),
      },
    })
  } catch (err: unknown) {
    sendError(res, err, 'Error completing ticket:')
  }
}

// ── Auto-assign offers ──────────────────────────────────────────────────────

/** Any signed-in staff member (offers are only ever made to staff of the ticket's department). */
function requireStaffUserId(req: AuthenticatedRequest): string {
  const userId = req.user?.id
  if (!userId || req.user?.residentId) throw new HttpError(401, 'Staff authentication required')
  return userId
}

/**
 * GET /api/v1/mobile/l3/tickets/offers
 * Tickets offered to me by auto-assign that are waiting for my answer.
 */
export async function getMyTicketOffers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = requireStaffUserId(req)
    const offers = await listOffersForStaff(userId)
    res.status(200).json({ success: true, data: offers, serverTime: new Date().toISOString() })
  } catch (err: unknown) {
    sendError(res, err, 'Error fetching ticket offers:')
  }
}

/**
 * POST /api/v1/mobile/l3/tickets/:id/offer/accept
 * Body: { tatOption, customTatDeadline? }. Assigns the ticket to me with that TAT.
 */
export async function acceptTicketOffer(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = requireStaffUserId(req)
    const input = req.body as AcceptTicketOfferInput
    const ticket = await acceptOffer(req.params.id as string, userId, input)
    res.status(200).json({
      success: true,
      message: 'Ticket accepted and assigned to you',
      data: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        tatOption: ticket.tatOption,
        customTatDeadline: ticket.customTatDeadline,
      },
    })
  } catch (err: unknown) {
    sendError(res, err, 'Error accepting ticket offer:')
  }
}

/**
 * POST /api/v1/mobile/l3/tickets/:id/offer/reject
 * Body: { reason } (required). The ticket moves to the next staff member.
 */
export async function rejectTicketOffer(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = requireStaffUserId(req)
    const { reason } = req.body as RejectTicketOfferInput
    await rejectOffer(req.params.id as string, userId, reason)
    res.status(200).json({ success: true, message: 'Ticket rejected' })
  } catch (err: unknown) {
    sendError(res, err, 'Error rejecting ticket offer:')
  }
}
