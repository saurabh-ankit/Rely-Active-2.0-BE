import { Op, type Transaction } from 'sequelize'
import sequelize from '../config/db/index.js'
import {
  Department,
  JobCategory,
  PropertyUnit,
  Role,
  Ticket,
  TicketActivityLog,
  TicketAutoAssignAttempt,
  TicketAutoAssignSetting,
  TicketTatHistory,
  User,
  UserDetail,
  UserLocation,
} from '../models/index.js'
import { NotificationActorType, NotificationRecipientType, NotificationSeverity } from '../enums/notification.enum.js'
import { TicketActivityType, TicketStatus } from '../enums/ticket.enum.js'
import { HttpError } from '../middlewares/error/http-error.js'
import { getShiftInfoForEmployees } from './staffShift.service.js'
import {
  listLocationStaffRecipients,
  publishTicketNotificationSafe,
} from './notifications/ticketNotification.service.js'
import type { NotificationActorInput } from './notifications/notificationAudience.service.js'

/**
 * Ticket auto-assign (docs/ticket-auto-assign.md).
 *
 * A resident's ticket is offered to the on-shift staff member of its department with the least
 * TAT load. They accept (setting the TAT) or reject (with a reason); no answer within the
 * response time counts as a rejection. When nobody is left, the ticket is escalated.
 *
 * Every state change locks the ticket row, and accept / reject only succeed while the offer is
 * still open and held by that staff member, so a late tap, a double tap, the expiry job or a
 * manual assign can never give a ticket two assignees.
 */

export const AUTO_ASSIGN_NAME = 'Auto-assign'
export const DEFAULT_RESPONSE_TIMEOUT_MINUTES = 2
export const AUTO_ASSIGN_TAT_OPTIONS = ['30 mins', '1-2 hour', '2-5 hours', 'Custom'] as const

const OPEN_STATUSES = [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD]
const PRESET_TAT_MINUTES: Record<string, number> = { '30 mins': 30, '1-2 hour': 120, '2-5 hours': 300 }
const NO_RESPONSE_REASON = 'No response'
/** Nobody on shift when the ticket is raised: wait this long, check again, then escalate. */
export const NO_STAFF_WAIT_MINUTES = 1
const WAITED_REASON = `Waited ${NO_STAFF_WAIT_MINUTES} min for staff on shift`

const SYSTEM_ACTOR: NotificationActorInput = { actorType: NotificationActorType.SYSTEM, actorName: AUTO_ASSIGN_NAME }

type UserWithProfile = User & { profile?: UserDetail | null }

function displayName(user: UserWithProfile | null | undefined, fallback = 'Staff'): string {
  if (!user) return fallback
  const fullName = `${user.profile?.firstName || ''} ${user.profile?.lastName || ''}`.trim()
  return fullName || user.username || user.email || fallback
}

async function loadUserName(userId: string | null | undefined): Promise<string> {
  if (!userId) return 'Staff'
  const user = (await User.findByPk(userId, {
    attributes: ['id', 'username', 'email'],
    include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'], required: false }],
  })) as UserWithProfile | null
  return displayName(user)
}

/* ------------------------------------------------------------------ settings */

export async function getAutoAssignSetting(
  locationId: string,
  departmentId: string | null | undefined,
): Promise<TicketAutoAssignSetting | null> {
  if (!departmentId) return null
  return TicketAutoAssignSetting.findOne({ where: { locationId, departmentId } })
}

/** Every active department for the property, with its toggle (off when never saved). */
export async function listAutoAssignSettings(locationId: string) {
  const [departments, settings] = await Promise.all([
    Department.findAll({
      where: { isActive: true, [Op.or]: [{ locationId }, { locationId: null }] },
      attributes: ['id', 'name', 'code'],
      order: [['name', 'ASC']],
    }),
    TicketAutoAssignSetting.findAll({ where: { locationId } }),
  ])
  const byDepartment = new Map(settings.map((s) => [s.departmentId, s]))
  return departments.map((d) => {
    const setting = byDepartment.get(d.id)
    return {
      departmentId: d.id,
      departmentName: d.name,
      departmentCode: d.code,
      isEnabled: setting?.isEnabled ?? false,
      responseTimeoutMinutes: setting?.responseTimeoutMinutes ?? DEFAULT_RESPONSE_TIMEOUT_MINUTES,
      updatedAt: setting?.updatedAt ?? null,
    }
  })
}

export async function saveAutoAssignSettings(
  locationId: string,
  items: Array<{ departmentId: string; isEnabled: boolean; responseTimeoutMinutes?: number | undefined }>,
  userId: string | null,
) {
  await sequelize.transaction(async (transaction) => {
    for (const item of items) {
      const existing = await TicketAutoAssignSetting.findOne({
        where: { locationId, departmentId: item.departmentId },
        transaction,
      })
      const values = {
        isEnabled: item.isEnabled,
        ...(item.responseTimeoutMinutes !== undefined ? { responseTimeoutMinutes: item.responseTimeoutMinutes } : {}),
        updatedBy: userId,
      }
      if (existing) {
        await existing.update(values, { transaction })
      } else {
        await TicketAutoAssignSetting.create(
          { locationId, departmentId: item.departmentId, ...values, createdBy: userId },
          { transaction },
        )
      }
    }
  })
  return listAutoAssignSettings(locationId)
}

/* ------------------------------------------------------------------- ranking */

/** When the ticket's TAT runs out, or null when it has no TAT. */
function tatDeadline(ticket: Ticket): Date | null {
  if (ticket.tatOption?.toLowerCase() === 'custom') return ticket.customTatDeadline || null
  const minutes = ticket.tatOption ? PRESET_TAT_MINUTES[ticket.tatOption] : undefined
  if (!minutes) return ticket.customTatDeadline || null
  const from = ticket.approvedAt || ticket.createdAt
  return from ? new Date(new Date(from).getTime() + minutes * 60_000) : null
}

export interface AutoAssignCandidate {
  userId: string
  name: string
  tatLoadMinutes: number
  openCount: number
  lastAssignedAt: number
}

/**
 * Staff who can take the ticket now, best first:
 * role EMPLOYEE at the property, in the ticket's department (its job category first), on shift
 * now; ordered by TAT load, then open tickets, then whoever was assigned least recently.
 */
export async function rankCandidates(ticket: Ticket, excludeUserIds: string[] = []): Promise<AutoAssignCandidate[]> {
  if (!ticket.departmentId) return []

  const postings = await UserLocation.findAll({
    where: { locId: ticket.locId, departmentId: ticket.departmentId, isActive: true, isDeleted: false },
    attributes: ['userId', 'jobCategoryId'],
    include: [{ model: Role, as: 'role', attributes: ['code'], where: { code: 'EMPLOYEE' }, required: true }],
  })

  const exclude = new Set(excludeUserIds)
  const inDepartment = new Set<string>()
  const inJobCategory = new Set<string>()
  for (const p of postings) {
    if (!p.userId || exclude.has(p.userId)) continue
    inDepartment.add(p.userId)
    if (ticket.jobCategoryId && p.jobCategoryId === ticket.jobCategoryId) inJobCategory.add(p.userId)
  }
  // The job category's staff when there are any on shift, otherwise the whole department.
  const pools = inJobCategory.size > 0 ? [inJobCategory, inDepartment] : [inDepartment]

  const shifts = await getShiftInfoForEmployees([...inDepartment], ticket.locId)

  for (const pool of pools) {
    const onShift = [...pool].filter((id) => shifts[id]?.isOnShift)
    if (onShift.length === 0) continue
    return rankByLoad(onShift)
  }
  return []
}

async function rankByLoad(userIds: string[]): Promise<AutoAssignCandidate[]> {
  const [openTickets, users] = await Promise.all([
    Ticket.findAll({
      where: { assignedToUserId: { [Op.in]: userIds }, status: { [Op.in]: OPEN_STATUSES } },
      attributes: ['id', 'assignedToUserId', 'tatOption', 'customTatDeadline', 'approvedAt', 'createdAt'],
    }),
    User.findAll({
      where: { id: { [Op.in]: userIds } },
      attributes: ['id', 'username', 'email'],
      include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'], required: false }],
    }) as Promise<UserWithProfile[]>,
  ])

  const lastAssigned = (await Ticket.findAll({
    where: { assignedToUserId: { [Op.in]: userIds } },
    attributes: ['assignedToUserId', [sequelize.fn('MAX', sequelize.col('approvedAt')), 'lastAssignedAt']],
    group: ['assignedToUserId'],
    raw: true,
  })) as unknown as Array<{ assignedToUserId: string; lastAssignedAt: string | Date | null }>
  const lastAssignedBy = new Map(
    lastAssigned.map((r) => [r.assignedToUserId, r.lastAssignedAt ? new Date(r.lastAssignedAt).getTime() : 0]),
  )

  const now = Date.now()
  const candidates = new Map<string, AutoAssignCandidate>(
    users.map((u) => [
      u.id,
      {
        userId: u.id,
        name: displayName(u),
        tatLoadMinutes: 0,
        openCount: 0,
        lastAssignedAt: lastAssignedBy.get(u.id) || 0,
      },
    ]),
  )
  for (const t of openTickets) {
    const c = t.assignedToUserId ? candidates.get(t.assignedToUserId) : undefined
    if (!c) continue
    c.openCount += 1
    const deadline = tatDeadline(t)
    // Overdue tickets count as 0
    if (deadline) c.tatLoadMinutes += Math.max(0, Math.round((deadline.getTime() - now) / 60_000))
  }

  return [...candidates.values()].sort(
    (a, b) => a.tatLoadMinutes - b.tatLoadMinutes || a.openCount - b.openCount || a.lastAssignedAt - b.lastAssignedAt,
  )
}

/* --------------------------------------------------------------------- flow */

async function lockTicket(ticketId: string, transaction: Transaction): Promise<Ticket | null> {
  return Ticket.findByPk(ticketId, { transaction, lock: transaction.LOCK.UPDATE })
}

/** Still waiting for a staff member: open, nobody assigned, no vendor. */
function isStillAutoAssignable(ticket: Ticket): boolean {
  return ticket.status === TicketStatus.OPEN && !ticket.assignedToUserId && !ticket.vendorId
}

type AfterCommit = () => Promise<void>

/**
 * Offers the ticket to the best staff member it hasn't been offered to yet, or escalates when
 * there is nobody. Runs inside the caller's transaction (the ticket row must be locked);
 * returns the notification to send once it commits.
 */
async function offerToNextLocked(ticket: Ticket, transaction: Transaction): Promise<AfterCommit | null> {
  if (!isStillAutoAssignable(ticket)) return null

  const attempts = await TicketAutoAssignAttempt.findAll({ where: { ticketId: ticket.id }, transaction })
  // Someone already holds it, or it is waiting for staff to come on shift
  if (attempts.some((a) => a.status === 'OFFERED' || a.status === 'WAITING')) return null

  const offersMade = attempts.filter((a) => a.userId).length
  const ranked = await rankCandidates(
    ticket,
    attempts.map((a) => a.userId).filter((id): id is string => !!id),
  )
  const next = ranked[0]
  if (!next) {
    const hasWaited = attempts.some((a) => !a.userId)
    // Nobody on shift at all yet: give it a minute before escalating (checked again by the cron)
    if (offersMade === 0 && !hasWaited) return waitForStaffLocked(ticket, attempts.length, transaction)
    return escalateLocked(ticket, offersMade, transaction)
  }

  const setting = await getAutoAssignSetting(ticket.locId, ticket.departmentId)
  const timeoutMinutes = setting?.responseTimeoutMinutes || DEFAULT_RESPONSE_TIMEOUT_MINUTES
  const offeredAt = new Date()
  const expiresAt = new Date(offeredAt.getTime() + timeoutMinutes * 60_000)

  const attempt = await TicketAutoAssignAttempt.create(
    {
      ticketId: ticket.id,
      userId: next.userId,
      attemptNumber: attempts.length + 1,
      tatLoadMinutes: next.tatLoadMinutes,
      status: 'OFFERED',
      offeredAt,
      expiresAt,
    },
    { transaction },
  )
  await ticket.update({ autoAssignStatus: 'OFFERED', offeredToUserId: next.userId }, { transaction })

  return async () => {
    const unit = ticket.unitId ? await PropertyUnit.findByPk(ticket.unitId, { attributes: ['unit_number'] }) : null
    const jobCategory = ticket.jobCategoryId
      ? await JobCategory.findByPk(ticket.jobCategoryId, { attributes: ['name'] })
      : null
    await publishTicketNotificationSafe({
      ticket,
      eventCode: 'TICKET_ASSIGN_OFFER',
      title: 'New ticket for you',
      message: `${ticket.title || 'Ticket'} (${ticket.ticketNumber})${unit ? ` · Flat ${unit.unit_number}` : ''}. Accept or reject within ${timeoutMinutes} min.`,
      actor: SYSTEM_ACTOR,
      dedupeKey: `ticket-assign-offer:${attempt.id}`,
      severity: NotificationSeverity.WARNING,
      actionValue: `/tickets/offers/${ticket.id}`,
      recipientsOnly: true,
      extraRecipients: [{ recipientType: NotificationRecipientType.USER, recipientUserId: next.userId }],
      payload: {
        ticketId: ticket.id,
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        offeredAt: offeredAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        responseTimeoutMinutes: timeoutMinutes,
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        description: ticket.description,
        category: ticket.category,
        jobCategory: jobCategory?.name || null,
        unitNumber: unit?.unit_number || null,
        priority: ticket.priority,
      },
    })
  }
}

/** Records the wait in the log; `expireOffers` checks the roster again when it runs out. */
async function waitForStaffLocked(ticket: Ticket, attemptsSoFar: number, transaction: Transaction): Promise<null> {
  const offeredAt = new Date()
  await TicketAutoAssignAttempt.create(
    {
      ticketId: ticket.id,
      userId: null,
      attemptNumber: attemptsSoFar + 1,
      status: 'WAITING',
      reason: 'No staff on shift; checking again shortly',
      offeredAt,
      expiresAt: new Date(offeredAt.getTime() + NO_STAFF_WAIT_MINUTES * 60_000),
    },
    { transaction },
  )
  await ticket.update({ autoAssignStatus: 'WAITING', offeredToUserId: null }, { transaction })
  return null
}

async function escalateLocked(ticket: Ticket, offersMade: number, transaction: Transaction): Promise<AfterCommit> {
  let reason: string
  if (offersMade === 0) {
    const [jobCategory, department] = await Promise.all([
      ticket.jobCategoryId ? JobCategory.findByPk(ticket.jobCategoryId, { attributes: ['name'], transaction }) : null,
      ticket.departmentId ? Department.findByPk(ticket.departmentId, { attributes: ['name'], transaction }) : null,
    ])
    reason = `No staff on shift for ${jobCategory?.name || department?.name || 'this ticket'} (waited ${NO_STAFF_WAIT_MINUTES} min)`
  } else {
    reason = `All ${offersMade} matching staff rejected or did not respond`
  }

  const escalatedAt = new Date()
  await ticket.update(
    {
      autoAssignStatus: 'ESCALATED',
      offeredToUserId: null,
      escalatedAt,
      escalatedByUserId: null,
      escalatedByName: AUTO_ASSIGN_NAME,
      escalationReason: reason,
    },
    { transaction },
  )
  await TicketActivityLog.create(
    {
      ticketId: ticket.id,
      performedByUserId: null,
      performedByName: AUTO_ASSIGN_NAME,
      activityType: TicketActivityType.UPDATED,
      fromStatus: ticket.status,
      toStatus: ticket.status,
      comment: `Auto-escalated: ${reason}. Assign it manually.`,
    },
    { transaction },
  )

  return async () => {
    await publishTicketNotificationSafe({
      ticket,
      eventCode: 'TICKET_ESCALATED',
      title: 'Ticket escalated',
      message: `${ticket.title || 'Ticket'} (${ticket.ticketNumber}) was escalated by auto-assign: ${reason}.`,
      actor: SYSTEM_ACTOR,
      dedupeKey: `ticket-auto-escalated:${ticket.id}`,
      payload: { reason, escalatedAt, autoAssign: true },
      extraRecipients: await listLocationStaffRecipients(ticket.locId),
    })
  }
}

/** Runs `work` on the locked ticket, then sends its notification once the change is saved. */
async function withLockedTicket(
  ticketId: string,
  work: (ticket: Ticket, transaction: Transaction) => Promise<AfterCommit | null>,
): Promise<void> {
  const after = await sequelize.transaction(async (transaction) => {
    const ticket = await lockTicket(ticketId, transaction)
    if (!ticket) return null
    return work(ticket, transaction)
  })
  if (after) await after()
}

/**
 * Called after a resident raises a ticket. Does nothing unless auto-assign is on for the
 * ticket's property and department. Never throws: the ticket stays unassigned on failure.
 */
export async function startAutoAssignSafe(ticketId: string): Promise<void> {
  try {
    const ticket = await Ticket.findByPk(ticketId, { attributes: ['id', 'locId', 'departmentId'] })
    if (!ticket?.departmentId) return
    const setting = await getAutoAssignSetting(ticket.locId, ticket.departmentId)
    if (!setting?.isEnabled) return
    await withLockedTicket(ticketId, offerToNextLocked)
  } catch (error) {
    console.error('Ticket auto-assign failed to start:', error)
  }
}

/** The open offer held by this staff member, or a 409 when it has moved on. */
async function findHeldOffer(ticket: Ticket, userId: string, transaction: Transaction) {
  const attempt = await TicketAutoAssignAttempt.findOne({
    where: { ticketId: ticket.id, userId, status: 'OFFERED' },
    transaction,
    lock: transaction.LOCK.UPDATE,
  })
  if (!attempt || ticket.offeredToUserId !== userId || !isStillAutoAssignable(ticket)) {
    throw new HttpError(409, 'This ticket is no longer available')
  }
  if (attempt.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(409, 'The time to respond has run out; the ticket has moved to the next staff member')
  }
  return attempt
}

export interface AcceptOfferInput {
  tatOption: string
  customTatDeadline?: Date | undefined
}

/** The staff member takes the ticket with the TAT they set. */
export async function acceptOffer(ticketId: string, userId: string, input: AcceptOfferInput): Promise<Ticket> {
  const isCustom = input.tatOption.toLowerCase() === 'custom'
  const tatOption = isCustom ? 'Custom' : input.tatOption
  const customTatDeadline = isCustom ? input.customTatDeadline || null : null
  const staffName = await loadUserName(userId)

  let accepted: Ticket | null = null
  await withLockedTicket(ticketId, async (ticket, transaction) => {
    const attempt = await findHeldOffer(ticket, userId, transaction)
    const now = new Date()
    const previousTatOption = ticket.tatOption || null
    const previousTatDeadline = tatDeadline(ticket)

    await attempt.update({ status: 'ACCEPTED', respondedAt: now, tatOption, customTatDeadline }, { transaction })
    await ticket.update(
      {
        assignedToUserId: userId,
        approvedAt: now,
        tatOption,
        customTatDeadline,
        autoAssignStatus: 'ASSIGNED',
        offeredToUserId: null,
        updatedBy: userId,
      },
      { transaction },
    )
    await TicketTatHistory.create(
      {
        ticketId: ticket.id,
        previousTatOption,
        previousTatDeadline,
        updatedTatOption: tatOption,
        updatedTatDeadline: tatDeadline(ticket),
        note: 'TAT set when accepting the auto-assigned ticket',
        changedByUserId: userId,
        changedByName: staffName,
        changedAt: now,
        createdBy: userId,
      },
      { transaction },
    )
    await TicketActivityLog.create(
      {
        ticketId: ticket.id,
        performedByUserId: userId,
        performedByName: staffName,
        activityType: TicketActivityType.ASSIGNED,
        fromStatus: ticket.status,
        toStatus: ticket.status,
        comment: `Auto-assigned to ${staffName} (accepted, TAT ${tatOption === 'Custom' && customTatDeadline ? customTatDeadline.toISOString() : tatOption})`,
        createdBy: userId,
      },
      { transaction },
    )
    accepted = ticket

    return async () => {
      await publishTicketNotificationSafe({
        ticket,
        eventCode: 'TICKET_ASSIGNED',
        title: 'Ticket assigned',
        message: `${ticket.title || 'Ticket'} (${ticket.ticketNumber}) was assigned to ${staffName}.`,
        actor: { actorType: NotificationActorType.USER, actorUserId: userId, actorName: staffName },
        payload: {
          status: ticket.status,
          assignedToUserId: userId,
          autoAssigned: true,
          tatOption,
          customTatDeadline,
        },
      })
    }
  })
  if (!accepted) throw new HttpError(404, 'Ticket not found')
  return accepted
}

/** The staff member turns the ticket down; it moves to the next staff member (or escalates). */
export async function rejectOffer(ticketId: string, userId: string, reason: string): Promise<void> {
  let found = false
  await withLockedTicket(ticketId, async (ticket, transaction) => {
    found = true
    const attempt = await findHeldOffer(ticket, userId, transaction)
    await attempt.update({ status: 'REJECTED', reason, respondedAt: new Date() }, { transaction })
    await ticket.update({ offeredToUserId: null }, { transaction })
    return offerToNextLocked(ticket, transaction)
  })
  if (!found) throw new HttpError(404, 'Ticket not found')
}

/**
 * Cron, every minute: offers nobody answered in time count as "No response" and move on;
 * a finished wait for staff on shift checks the roster again (offer, or escalate).
 */
export async function expireOffers(): Promise<number> {
  const due = await TicketAutoAssignAttempt.findAll({
    where: { status: { [Op.in]: ['OFFERED', 'WAITING'] }, expiresAt: { [Op.lte]: new Date() } },
    attributes: ['id', 'ticketId', 'status'],
    limit: 200,
  })
  let expired = 0
  for (const { id, ticketId, status } of due) {
    try {
      await withLockedTicket(ticketId, async (ticket, transaction) => {
        // Only if it is still open: another server, or the staff member, may have just answered it.
        const [count] = await TicketAutoAssignAttempt.update(
          {
            status: 'EXPIRED',
            reason: status === 'WAITING' ? WAITED_REASON : NO_RESPONSE_REASON,
            respondedAt: new Date(),
          },
          { where: { id, status }, transaction },
        )
        if (count === 0) return null
        expired += 1
        await ticket.update({ offeredToUserId: null }, { transaction })
        return offerToNextLocked(ticket, transaction)
      })
    } catch (error) {
      console.error('Ticket auto-assign: failed to expire offer', id, error)
    }
  }
  return expired
}

/**
 * An admin assigned the ticket (or gave it to a vendor) by hand: the open offer is withdrawn.
 * The log keeps the earlier offers.
 */
export async function endAutoAssignOnManualAssignSafe(ticketId: string, userId: string | null): Promise<void> {
  try {
    await sequelize.transaction(async (transaction) => {
      const ticket = await lockTicket(ticketId, transaction)
      if (!ticket?.autoAssignStatus) return
      const [count] = await TicketAutoAssignAttempt.update(
        { status: 'CANCELLED', reason: 'Assigned manually', respondedAt: new Date(), updatedBy: userId },
        { where: { ticketId, status: { [Op.in]: ['OFFERED', 'WAITING'] } }, transaction },
      )
      if (count > 0 || ticket.offeredToUserId) {
        await ticket.update(
          {
            offeredToUserId: null,
            ...(ticket.autoAssignStatus === 'OFFERED' || ticket.autoAssignStatus === 'WAITING'
              ? { autoAssignStatus: null }
              : {}),
          },
          { transaction },
        )
      }
    })
  } catch (error) {
    console.error('Ticket auto-assign: failed to end on manual assign', ticketId, error)
  }
}

/* ---------------------------------------------------------------------- reads */

/** Offers waiting for this staff member (the Staff App's "Waiting for you"). */
export async function listOffersForStaff(userId: string) {
  const attempts = await TicketAutoAssignAttempt.findAll({
    where: { userId, status: 'OFFERED', expiresAt: { [Op.gt]: new Date() } },
    include: [
      {
        model: Ticket,
        as: 'ticket',
        required: true,
        include: [
          { model: PropertyUnit, as: 'unit', attributes: ['id', 'unit_number'], required: false },
          { model: JobCategory, as: 'jobCategory', attributes: ['id', 'name'], required: false },
        ],
      },
    ],
    order: [['offeredAt', 'ASC']],
  })
  return attempts.map((a) => {
    const t = (a as TicketAutoAssignAttempt & { ticket: Ticket & { unit?: PropertyUnit; jobCategory?: JobCategory } })
      .ticket
    return {
      attemptId: a.id,
      ticketId: t.id,
      ticketNumber: t.ticketNumber,
      title: t.title,
      description: t.description,
      category: t.category,
      jobCategory: t.jobCategory?.name || null,
      unitNumber: t.unit?.unit_number || null,
      priority: t.priority,
      attachments: t.attachments,
      createdAt: t.createdAt,
      offeredAt: a.offeredAt,
      expiresAt: a.expiresAt,
    }
  })
}

/** The auto-assign log for one ticket (Admin Dashboard). */
export async function getAutoAssignLog(ticketId: string) {
  const ticket = await Ticket.findByPk(ticketId, {
    attributes: ['id', 'autoAssignStatus', 'offeredToUserId', 'escalatedAt', 'escalatedByName', 'escalationReason'],
  })
  if (!ticket) throw new HttpError(404, 'Ticket not found')
  const attempts = await TicketAutoAssignAttempt.findAll({
    where: { ticketId },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'email'],
        include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'], required: false }],
      },
    ],
    order: [['attemptNumber', 'ASC']],
  })
  const autoEscalated = ticket.autoAssignStatus === 'ESCALATED' && ticket.escalatedByName === AUTO_ASSIGN_NAME
  return {
    autoAssignStatus: ticket.autoAssignStatus,
    offeredToUserId: ticket.offeredToUserId,
    escalation: autoEscalated ? { escalatedAt: ticket.escalatedAt, reason: ticket.escalationReason } : null,
    attempts: attempts.map((a) => ({
      id: a.id,
      attemptNumber: a.attemptNumber,
      userId: a.userId,
      // A row without a staff member is the wait for someone to come on shift
      staffName: a.userId
        ? displayName((a as TicketAutoAssignAttempt & { user?: UserWithProfile }).user, 'Former staff')
        : null,
      isWait: !a.userId,
      tatLoadMinutes: a.tatLoadMinutes,
      status: a.status,
      reason: a.reason,
      tatOption: a.tatOption,
      customTatDeadline: a.customTatDeadline,
      offeredAt: a.offeredAt,
      expiresAt: a.expiresAt,
      respondedAt: a.respondedAt,
    })),
  }
}
