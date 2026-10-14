import { Op, type Transaction, type WhereOptions } from 'sequelize'
import {
  NotificationActionType,
  NotificationChannel,
  NotificationModule,
  NotificationRecipientType,
  NotificationSeverity,
  NotificationStatus,
} from '../../enums/notification.enum.js'
import {
  NotificationEvent,
  NotificationInbox,
  Resident,
  ResidentFamilyMember,
  User,
  UserDetail,
} from '../../models/index.js'
import { dispatchNotificationPushSafe } from './notificationPush.service.js'
import type { NotificationActorInput, NotificationViewer } from './notificationAudience.service.js'

export interface NotificationRecipientInput {
  recipientType: NotificationRecipientType
  recipientUserId?: string | null
  recipientResidentId?: string | null
  recipientFamilyMemberId?: string | null
}

export interface CreateNotificationEventInput {
  module: NotificationModule | string
  eventCode: string
  entityType: string
  entityId: string
  entityLabel?: string | null
  companyId?: string | null
  locationId?: string | null
  actor?: NotificationActorInput | null
  title: string
  message: string
  actionType?: NotificationActionType
  actionValue?: string | null
  severity?: NotificationSeverity
  payload?: Record<string, unknown> | null
  dedupeKey?: string | null
  occurredAt?: Date
  recipients: NotificationRecipientInput[]
  createdBy?: string | null
  transaction?: Transaction | null
}

export interface NotificationListQuery {
  page: number
  limit: number
  status?: NotificationStatus | 'ALL' | undefined
  module?: string | undefined
}

interface RecipientKeyParts {
  recipientType: NotificationRecipientType
  recipientUserId: string | null
  recipientResidentId: string | null
  recipientFamilyMemberId: string | null
}

function toRecipientKey(parts: RecipientKeyParts): string {
  return [
    parts.recipientType,
    parts.recipientUserId || '-',
    parts.recipientResidentId || '-',
    parts.recipientFamilyMemberId || '-',
  ].join(':')
}
// Based on recipient you change the payload so data would be clean & clear.
function normalizeRecipient(input: NotificationRecipientInput): RecipientKeyParts | null {
  const recipientType = input.recipientType
  if (recipientType === NotificationRecipientType.USER && input.recipientUserId) {
    return {
      recipientType,
      recipientUserId: input.recipientUserId,
      recipientResidentId: null,
      recipientFamilyMemberId: null,
    }
  }
  if (recipientType === NotificationRecipientType.RESIDENT && input.recipientResidentId) {
    return {
      recipientType,
      recipientUserId: null,
      recipientResidentId: input.recipientResidentId,
      recipientFamilyMemberId: null,
    }
  }
  if (recipientType === NotificationRecipientType.FAMILY_MEMBER && input.recipientFamilyMemberId) {
    return {
      recipientType,
      recipientUserId: null,
      recipientResidentId: null,
      recipientFamilyMemberId: input.recipientFamilyMemberId,
    }
  }
  return null
}

function uniqueRecipients(recipients: NotificationRecipientInput[]): RecipientKeyParts[] {
  const deduped = new Map<string, RecipientKeyParts>()
  for (const recipient of recipients) {
    const normalized = normalizeRecipient(recipient)
    if (!normalized) continue
    deduped.set(toRecipientKey(normalized), normalized)
  }
  return Array.from(deduped.values())
}

function viewerWhere(viewer: NotificationViewer): WhereOptions {
  if (viewer.recipientType === NotificationRecipientType.USER) {
    return { recipientType: NotificationRecipientType.USER, recipientUserId: viewer.recipientUserId || null }
  }
  if (viewer.recipientType === NotificationRecipientType.RESIDENT) {
    return {
      recipientType: NotificationRecipientType.RESIDENT,
      recipientResidentId: viewer.recipientResidentId || null,
    }
  }
  return {
    recipientType: NotificationRecipientType.FAMILY_MEMBER,
    recipientFamilyMemberId: viewer.recipientFamilyMemberId || null,
  }
}

/**
 * Creates one event and fan-outs inbox rows for the recipients.
 * This is the single write path so every module can publish in the same shape.
 */
export async function createNotificationEvent(input: CreateNotificationEventInput): Promise<NotificationEvent> {
  const recipients = uniqueRecipients(input.recipients)
  if (recipients.length === 0) {
    throw new Error('At least one valid recipient is required to create a notification event')
  }

  if (input.dedupeKey) {
    const existing = await NotificationEvent.findOne({
      where: { dedupeKey: input.dedupeKey },
      transaction: input.transaction ?? null,
    })
    if (existing) {
      return existing
    }
  }

  const actor = input.actor || null
  const event = await NotificationEvent.create(
    {
      module: input.module,
      eventCode: input.eventCode,
      entityType: input.entityType,
      entityId: input.entityId,
      entityLabel: input.entityLabel || null,
      companyId: input.companyId || null,
      locationId: input.locationId || null,
      actorType: actor?.actorType || null,
      actorUserId: actor?.actorUserId || null,
      actorResidentId: actor?.actorResidentId || null,
      actorFamilyMemberId: actor?.actorFamilyMemberId || null,
      actorName: actor?.actorName || null,
      title: input.title,
      message: input.message,
      actionType: input.actionType || NotificationActionType.OPEN_ENTITY,
      actionValue: input.actionValue || null,
      severity: input.severity || NotificationSeverity.INFO,
      payload: input.payload || null,
      dedupeKey: input.dedupeKey || null,
      occurredAt: input.occurredAt || new Date(),
      createdBy: input.createdBy || null,
      updatedBy: input.createdBy || null,
    },
    { transaction: input.transaction ?? null },
  )

  await NotificationInbox.bulkCreate(
    recipients.map((recipient) => ({
      eventId: event.id,
      recipientType: recipient.recipientType,
      recipientUserId: recipient.recipientUserId,
      recipientResidentId: recipient.recipientResidentId,
      recipientFamilyMemberId: recipient.recipientFamilyMemberId,
      channel: NotificationChannel.IN_APP,
      status: NotificationStatus.UNREAD,
      deliveredAt: new Date(),
      createdBy: input.createdBy || null,
      updatedBy: input.createdBy || null,
    })),
    { transaction: input.transaction ?? null },
  )

  if (!input.transaction) {
    await dispatchNotificationPushSafe({
      event,
      recipients,
    })
  }

  return event
}

/**
 * Returns one person's inbox feed with event details in newest-first order.
 * The query powers both the bell dropdown and a larger notifications page.
 */
export async function listNotificationsForViewer(viewer: NotificationViewer, query: NotificationListQuery) {
  const page = Math.max(1, query.page || 1)
  const limit = Math.min(100, Math.max(1, query.limit || 20))

  const inboxWhere: Record<string, unknown> = {
    ...viewerWhere(viewer),
  }

  if (query.status && query.status !== 'ALL') {
    inboxWhere.status = query.status
  } else {
    inboxWhere.status = { [Op.ne]: NotificationStatus.ARCHIVED }
  }

  const eventWhere: Record<string, unknown> = {}
  if (query.module && query.module.trim()) {
    eventWhere.module = query.module.trim().toUpperCase()
  }

  const { rows, count } = await NotificationInbox.findAndCountAll({
    where: inboxWhere,
    include: [
      {
        model: NotificationEvent,
        as: 'event',
        required: true,
        where: eventWhere,
        include: [
          {
            model: User,
            as: 'actorUser',
            required: false,
            attributes: ['id', 'email', 'username'],
            include: [{ model: UserDetail, as: 'profile', required: false, attributes: ['firstName', 'lastName'] }],
          },
          {
            model: Resident,
            as: 'actorResident',
            required: false,
            attributes: ['id', 'firstName', 'lastName', 'email'],
          },
          {
            model: ResidentFamilyMember,
            as: 'actorFamilyMember',
            required: false,
            attributes: ['id', 'firstName', 'lastName', 'relation', 'email'],
          },
        ],
      },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  })

  return {
    items: rows,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  }
}

export async function getUnreadCountForViewer(viewer: NotificationViewer): Promise<number> {
  return NotificationInbox.count({
    where: {
      ...viewerWhere(viewer),
      status: NotificationStatus.UNREAD,
    },
  })
}

export async function markNotificationRead(viewer: NotificationViewer, notificationId: string): Promise<boolean> {
  const target = await NotificationInbox.findOne({
    where: {
      id: notificationId,
      ...viewerWhere(viewer),
    },
  })
  if (!target) return false

  if (target.status !== NotificationStatus.READ) {
    await target.update({ status: NotificationStatus.READ, readAt: new Date() })
  }
  return true
}

/**
 * Marks every unread row as read for this person.
 * Optional module filter lets the UI "clear tickets only" in one tap.
 */
export async function markAllNotificationsRead(viewer: NotificationViewer, module?: string): Promise<number> {
  const inboxRows = await NotificationInbox.findAll({
    where: {
      ...viewerWhere(viewer),
      status: NotificationStatus.UNREAD,
    },
    include: [
      {
        model: NotificationEvent,
        as: 'event',
        required: true,
        where: module && module.trim() ? { module: module.trim().toUpperCase() } : {},
      },
    ],
    attributes: ['id'],
  })

  const ids = inboxRows.map((row) => row.id)
  if (ids.length === 0) return 0

  await NotificationInbox.update(
    { status: NotificationStatus.READ, readAt: new Date() },
    {
      where: {
        id: { [Op.in]: ids },
      },
    },
  )

  return ids.length
}

export async function archiveNotification(viewer: NotificationViewer, notificationId: string): Promise<boolean> {
  const target = await NotificationInbox.findOne({
    where: {
      id: notificationId,
      ...viewerWhere(viewer),
    },
  })
  if (!target) return false

  await target.update({
    status: NotificationStatus.ARCHIVED,
    archivedAt: new Date(),
    readAt: target.readAt || new Date(),
  })
  return true
}
