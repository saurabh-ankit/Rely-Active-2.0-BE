import { NotificationActorType, NotificationRecipientType } from '../../enums/notification.enum.js'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'

export interface NotificationActorInput {
  actorType: NotificationActorType
  actorUserId?: string | null
  actorResidentId?: string | null
  actorFamilyMemberId?: string | null
  actorName?: string | null
}

export interface NotificationViewer {
  recipientType: NotificationRecipientType
  recipientUserId?: string | null
  recipientResidentId?: string | null
  recipientFamilyMemberId?: string | null
}

/**
 * Converts the logged-in request identity into the inbox identity we filter by.
 * This keeps every notification query naturally scoped to "my own" items.
 */
export function resolveNotificationViewer(req: AuthenticatedRequest): NotificationViewer | null {
  const user = req.user
  if (!user) return null

  if (user.familyMemberId) {
    return {
      recipientType: NotificationRecipientType.FAMILY_MEMBER,
      recipientFamilyMemberId: user.familyMemberId,
    }
  }

  if (user.residentId) {
    return {
      recipientType: NotificationRecipientType.RESIDENT,
      recipientResidentId: user.residentId,
    }
  }

  if (user.id) {
    return {
      recipientType: NotificationRecipientType.USER,
      recipientUserId: user.id,
    }
  }

  return null
}

/**
 * Converts request identity into a standard actor shape that can be reused by
 * every module when it publishes a notification event.
 */
export function resolveNotificationActor(req: AuthenticatedRequest, fallbackName = 'System'): NotificationActorInput {
  const user = req.user
  if (!user) {
    return {
      actorType: NotificationActorType.SYSTEM,
      actorName: fallbackName,
    }
  }

  if (user.familyMemberId) {
    return {
      actorType: NotificationActorType.FAMILY_MEMBER,
      actorFamilyMemberId: user.familyMemberId,
      actorName: user.email || fallbackName,
    }
  }

  if (user.residentId) {
    return {
      actorType: NotificationActorType.RESIDENT,
      actorResidentId: user.residentId,
      actorName: user.email || fallbackName,
    }
  }

  return {
    actorType: NotificationActorType.USER,
    actorUserId: user.id,
    actorName: user.email || fallbackName,
  }
}
