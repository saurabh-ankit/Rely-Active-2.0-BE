import { NotificationActionType, NotificationModule, NotificationRecipientType } from '../../enums/notification.enum.js'
import { TicketFeedback, UserLocation, type Ticket } from '../../models/index.js'
import type { NotificationActorInput } from './notificationAudience.service.js'
import { createNotificationEvent, type NotificationRecipientInput } from './notification.service.js'

export interface PublishTicketNotificationInput {
  ticket: Ticket
  eventCode: string
  title: string
  message: string
  actor?: NotificationActorInput | null
  payload?: Record<string, unknown> | null
  dedupeKey?: string | null
  actionValue?: string | null
  extraRecipients?: NotificationRecipientInput[]
  /** Only the resident and family member on the ticket (not the staff). */
  householdOnly?: boolean
}

/** Staff mapped to the ticket's property (web app admins and L3), e.g. for a new or escalated ticket. */
export async function listLocationStaffRecipients(
  locId: string | null | undefined,
): Promise<NotificationRecipientInput[]> {
  if (!locId) return []
  const locationStaff = await UserLocation.findAll({
    where: { locId, isDeleted: false },
    attributes: ['userId'],
  })
  const userIds = new Set(
    locationStaff
      .map((entry) => entry.userId)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  )
  return Array.from(userIds).map((userId) => ({
    recipientType: NotificationRecipientType.USER,
    recipientUserId: userId,
  }))
}

function collectTicketRecipients(ticket: Ticket): NotificationRecipientInput[] {
  const recipients: NotificationRecipientInput[] = []

  if (ticket.raisedByUserId) {
    recipients.push({ recipientType: NotificationRecipientType.USER, recipientUserId: ticket.raisedByUserId })
  }
  if (ticket.assignedToUserId) {
    recipients.push({ recipientType: NotificationRecipientType.USER, recipientUserId: ticket.assignedToUserId })
  }
  if (ticket.approvedByUserId) {
    recipients.push({ recipientType: NotificationRecipientType.USER, recipientUserId: ticket.approvedByUserId })
  }
  if (ticket.workStartedByUserId) {
    recipients.push({ recipientType: NotificationRecipientType.USER, recipientUserId: ticket.workStartedByUserId })
  }
  if (ticket.completedByUserId) {
    recipients.push({ recipientType: NotificationRecipientType.USER, recipientUserId: ticket.completedByUserId })
  }
  if (ticket.verifiedByUserId) {
    recipients.push({ recipientType: NotificationRecipientType.USER, recipientUserId: ticket.verifiedByUserId })
  }

  if (ticket.residentId) {
    recipients.push({ recipientType: NotificationRecipientType.RESIDENT, recipientResidentId: ticket.residentId })
  }
  if (ticket.familyMemberId) {
    recipients.push({
      recipientType: NotificationRecipientType.FAMILY_MEMBER,
      recipientFamilyMemberId: ticket.familyMemberId,
    })
  }

  return recipients
}

/**
 * Builds and publishes ticket notifications in one shared place.
 * Every ticket flow reuses this so recipients and message format stay consistent.
 */
export async function publishTicketNotification(input: PublishTicketNotificationInput): Promise<void> {
  const ticket = input.ticket
  const recipients = [...collectTicketRecipients(ticket), ...(input.extraRecipients || [])].filter(
    (recipient) => !input.householdOnly || recipient.recipientType !== NotificationRecipientType.USER,
  )
  if (recipients.length === 0) {
    return
  }

  await createNotificationEvent({
    module: NotificationModule.TICKETS,
    eventCode: input.eventCode,
    entityType: 'TICKET',
    entityId: ticket.id,
    entityLabel: ticket.ticketNumber || ticket.title || ticket.id,
    locationId: ticket.locId,
    actor: input.actor || null,
    title: input.title,
    message: input.message,
    actionType: NotificationActionType.OPEN_ENTITY,
    actionValue: input.actionValue || `/admin/tickets?ticketId=${ticket.id}`,
    payload: input.payload || null,
    dedupeKey: input.dedupeKey || null,
    recipients,
    createdBy: input.actor?.actorUserId || null,
  })
}

/**
 * Notifications should never block the main ticket action.
 * If anything goes wrong here, we log and continue the user flow.
 */
export async function publishTicketNotificationSafe(input: PublishTicketNotificationInput): Promise<void> {
  try {
    await publishTicketNotification(input)
  } catch (error) {
    console.error('Failed to publish ticket notification:', error)
  }
}

/**
 * Once a ticket is closed (verified) from the web, asks the household how the service was. The
 * resident app opens a feedback popup from it; it also lands in their notifications (Updates).
 * Sent once per ticket, and not when feedback was already given.
 */
export async function requestTicketFeedbackSafe(input: {
  ticket: Ticket
  actor?: NotificationActorInput | null
  closedByName?: string | null
}): Promise<void> {
  try {
    const { ticket } = input
    if (!ticket.residentId) return
    if (await TicketFeedback.findOne({ where: { ticketId: ticket.id }, attributes: ['id'] })) return

    await publishTicketNotification({
      ticket,
      eventCode: 'TICKET_FEEDBACK_REQUESTED',
      title: 'How was the service?',
      message: `${ticket.title || 'Your ticket'} (${ticket.ticketNumber}) is closed. Tap to rate the service and share your feedback.`,
      actor: input.actor || null,
      dedupeKey: `ticket-feedback-request:${ticket.id}`,
      householdOnly: true,
      payload: {
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        category: ticket.category,
        status: ticket.status,
        closedAt: ticket.closedAt || ticket.verifiedAt || new Date(),
        closedBy: input.closedByName || null,
      },
    })
  } catch (error) {
    console.error('Failed to request ticket feedback:', error)
  }
}
