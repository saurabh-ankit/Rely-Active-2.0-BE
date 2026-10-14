import { NotificationActionType, NotificationModule, NotificationRecipientType } from '../../enums/notification.enum.js'
import type { Ticket } from '../../models/index.js'
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
  const recipients = [...collectTicketRecipients(ticket), ...(input.extraRecipients || [])]
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
