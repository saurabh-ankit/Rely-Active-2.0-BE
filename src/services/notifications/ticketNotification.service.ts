import { NotificationActionType, NotificationModule } from '../../enums/notification.enum.js'
import type { Ticket } from '../../models/index.js'
import type { NotificationActorInput } from './notificationAudience.service.js'
import { createNotificationEvent, type NotificationRecipientInput } from './notification.service.js'
import { resolveTicketAudience } from './ticketNotificationAudienceResolver.service.js'

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

/**
 * Builds and publishes ticket notifications in one shared place.
 * Every ticket flow reuses this so recipients and message format stay consistent.
 */
export async function publishTicketNotification(input: PublishTicketNotificationInput): Promise<void> {
  const ticket = input.ticket
  const recipients = await resolveTicketAudience({
    ticket,
    actor: input.actor || null,
    extraRecipients: input.extraRecipients || [],
  })

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
