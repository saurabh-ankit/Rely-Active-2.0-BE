import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import {
  archiveNotification,
  getUnreadCountForViewer,
  listNotificationsForViewer,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/notifications/notification.service.js'
import { resolveNotificationViewer } from '../../services/notifications/notificationAudience.service.js'
import {
  deactivateDeviceToken,
  registerDeviceToken,
} from '../../services/notifications/notificationDeviceToken.service.js'
import type {
  MarkAllNotificationsReadInput,
  NotificationListQueryInput,
  RegisterNotificationDeviceInput,
  UnregisterNotificationDeviceInput,
} from '../../validations/notification.validation.js'

function toActorName(item: {
  actorName?: string | null
  actorUser?: {
    profile?: { firstName?: string | null; lastName?: string | null } | null
    username?: string | null
    email?: string | null
  } | null
  actorResident?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null
  actorFamilyMember?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null
}): string | null {
  if (item.actorName) return item.actorName

  const user = item.actorUser
  const resident = item.actorResident
  const familyMember = item.actorFamilyMember

  const userName = `${user?.profile?.firstName || ''} ${user?.profile?.lastName || ''}`.trim()
  if (userName) return userName
  if (user?.username) return user.username
  if (user?.email) return user.email

  const residentName = `${resident?.firstName || ''} ${resident?.lastName || ''}`.trim()
  if (residentName) return residentName
  if (resident?.email) return resident.email

  const familyName = `${familyMember?.firstName || ''} ${familyMember?.lastName || ''}`.trim()
  if (familyName) return familyName
  if (familyMember?.email) return familyMember.email

  return null
}

/**
 * Converts the DB row shape to a clean API response used by the web/mobile inbox.
 */
function toNotificationItem(row: {
  id: string
  status: string
  readAt?: Date | null
  archivedAt?: Date | null
  deliveredAt: Date
  createdAt?: Date
  event?: {
    id: string
    module: string
    eventCode: string
    entityType: string
    entityId: string
    entityLabel?: string | null
    title: string
    message: string
    severity: string
    actionType: string
    actionValue?: string | null
    payload?: Record<string, unknown> | null
    occurredAt: Date
    actorName?: string | null
    actorUser?: {
      profile?: { firstName?: string | null; lastName?: string | null } | null
      username?: string | null
      email?: string | null
    } | null
    actorResident?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null
    actorFamilyMember?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null
  } | null
}) {
  const event = row.event
  return {
    id: row.id,
    status: row.status,
    readAt: row.readAt || null,
    archivedAt: row.archivedAt || null,
    deliveredAt: row.deliveredAt,
    createdAt: row.createdAt,
    event: event
      ? {
          id: event.id,
          module: event.module,
          eventCode: event.eventCode,
          entityType: event.entityType,
          entityId: event.entityId,
          entityLabel: event.entityLabel || null,
          title: event.title,
          message: event.message,
          severity: event.severity,
          actionType: event.actionType,
          actionValue: event.actionValue || null,
          payload: event.payload || null,
          occurredAt: event.occurredAt,
          actorName: toActorName(event),
        }
      : null,
  }
}

/** GET /api/v1/notifications */
export async function getNotifications(req: AuthenticatedRequest, res: Response): Promise<void> {
  const viewer = resolveNotificationViewer(req)
  if (!viewer) {
    res.status(401).json({ success: false, message: 'Authentication required' })
    return
  }

  const query = req.query as unknown as NotificationListQueryInput
  const result = await listNotificationsForViewer(viewer, query)

  res.status(200).json({
    success: true,
    data: {
      notifications: result.items.map((item) => toNotificationItem(item.toJSON())),
      pagination: result.pagination,
    },
  })
}

/** GET /api/v1/notifications/unread-count */
export async function getNotificationUnreadCount(req: AuthenticatedRequest, res: Response): Promise<void> {
  const viewer = resolveNotificationViewer(req)
  if (!viewer) {
    res.status(401).json({ success: false, message: 'Authentication required' })
    return
  }

  const unreadCount = await getUnreadCountForViewer(viewer)
  res.status(200).json({ success: true, data: { unreadCount } })
}

/** PATCH /api/v1/notifications/:id/read */
export async function markNotificationAsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
  const viewer = resolveNotificationViewer(req)
  if (!viewer) {
    res.status(401).json({ success: false, message: 'Authentication required' })
    return
  }

  const updated = await markNotificationRead(viewer, req.params.id as string)
  if (!updated) {
    res.status(404).json({ success: false, message: 'Notification not found' })
    return
  }

  res.status(200).json({ success: true, message: 'Notification marked as read' })
}

/** PATCH /api/v1/notifications/read-all */
export async function markAllNotificationsAsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
  const viewer = resolveNotificationViewer(req)
  if (!viewer) {
    res.status(401).json({ success: false, message: 'Authentication required' })
    return
  }

  const body = req.body as MarkAllNotificationsReadInput
  const affected = await markAllNotificationsRead(viewer, body.module)

  res.status(200).json({ success: true, message: 'Notifications marked as read', data: { affected } })
}

/** PATCH /api/v1/notifications/:id/archive */
export async function archiveNotificationItem(req: AuthenticatedRequest, res: Response): Promise<void> {
  const viewer = resolveNotificationViewer(req)
  if (!viewer) {
    res.status(401).json({ success: false, message: 'Authentication required' })
    return
  }

  const updated = await archiveNotification(viewer, req.params.id as string)
  if (!updated) {
    res.status(404).json({ success: false, message: 'Notification not found' })
    return
  }

  res.status(200).json({ success: true, message: 'Notification archived' })
}

/** POST /api/v1/notifications/devices/register */
export async function registerNotificationDevice(req: AuthenticatedRequest, res: Response): Promise<void> {
  const viewer = resolveNotificationViewer(req)
  if (!viewer) {
    res.status(401).json({ success: false, message: 'Authentication required' })
    return
  }

  const body = req.body as RegisterNotificationDeviceInput
  const token = await registerDeviceToken({
    ...viewer,
    appSurface: body.appSurface,
    platform: body.platform,
    fcmToken: body.fcmToken,
    deviceId: body.deviceId,
    appVersion: body.appVersion,
    createdBy: req.user?.id || null,
  })

  if (!token) {
    res.status(400).json({ success: false, message: 'Unable to register notification device' })
    return
  }

  res.status(200).json({
    success: true,
    message: 'Notification device registered',
    data: {
      id: token.id,
      isActive: token.isActive,
      appSurface: token.appSurface,
      platform: token.platform,
      lastRegisteredAt: token.lastRegisteredAt,
      lastSeenAt: token.lastSeenAt,
    },
  })
}

/** POST /api/v1/notifications/devices/unregister */
export async function unregisterNotificationDevice(req: AuthenticatedRequest, res: Response): Promise<void> {
  const viewer = resolveNotificationViewer(req)
  if (!viewer) {
    res.status(401).json({ success: false, message: 'Authentication required' })
    return
  }

  const body = req.body as UnregisterNotificationDeviceInput
  const affected = await deactivateDeviceToken({
    ...viewer,
    fcmToken: body.fcmToken,
    reason: body.reason || 'USER_UNREGISTERED',
    updatedBy: req.user?.id || null,
  })

  res.status(200).json({
    success: true,
    message: affected > 0 ? 'Notification device unregistered' : 'No active device token found',
    data: { affected },
  })
}
