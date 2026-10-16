import { NotificationRecipientType } from '../../enums/notification.enum.js'
import { Role, User, UserLocation } from '../../models/index.js'
import type { Ticket } from '../../models/index.js'
import type { NotificationActorInput } from './notificationAudience.service.js'
import type { NotificationRecipientInput } from './notification.service.js'

export interface ResolveTicketAudienceInput {
  ticket: Ticket
  actor?: NotificationActorInput | null
  extraRecipients?: NotificationRecipientInput[]
}

function collectResidentRaiser(ticket: Ticket): NotificationRecipientInput[] {
  if (ticket.familyMemberId) {
    return [
      {
        recipientType: NotificationRecipientType.FAMILY_MEMBER,
        recipientFamilyMemberId: ticket.familyMemberId,
      },
    ]
  }

  if (ticket.residentId) {
    return [
      {
        recipientType: NotificationRecipientType.RESIDENT,
        recipientResidentId: ticket.residentId,
      },
    ]
  }

  return []
}

function collectOperationalUsers(ticket: Ticket, actor?: NotificationActorInput | null): NotificationRecipientInput[] {
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
  if (actor?.actorUserId) {
    recipients.push({ recipientType: NotificationRecipientType.USER, recipientUserId: actor.actorUserId })
  }

  return recipients
}

function isAdminRoleCode(code: string): boolean {
  if (!code) return false
  const normalized = code.toUpperCase()
  return normalized === 'ADMIN' || normalized === 'SUPER_ADMIN' || normalized.endsWith('_ADMIN')
}

function isManagerRoleCode(code: string): boolean {
  if (!code) return false
  const normalized = code.toUpperCase()
  return normalized === 'MANAGER' || normalized.includes('MANAGER')
}

async function collectLocationManagers(ticket: Ticket): Promise<NotificationRecipientInput[]> {
  if (!ticket.locId) return []

  const userLocations = (await UserLocation.findAll({
    where: {
      locId: ticket.locId,
      isActive: true,
      isDeleted: false,
    },
    include: [
      {
        model: Role,
        as: 'role',
        attributes: ['code', 'isActive'],
        required: false,
      },
      {
        model: User,
        as: 'user',
        attributes: ['id', 'isActive', 'isDeleted'],
        required: true,
      },
    ],
    attributes: ['userId', 'departmentId'],
  })) as Array<UserLocation & { role?: Role | null; user?: User | null }>

  const recipients: NotificationRecipientInput[] = []
  for (const userLocation of userLocations) {
    const user = userLocation.user
    if (!user || !user.id || !user.isActive || user.isDeleted) continue

    const roleCode = String(userLocation.role?.code || '').toUpperCase()
    const roleActive = userLocation.role?.isActive !== false
    if (!roleActive || !roleCode) continue

    if (isAdminRoleCode(roleCode)) {
      recipients.push({
        recipientType: NotificationRecipientType.USER,
        recipientUserId: user.id,
      })
      continue
    }

    if (isManagerRoleCode(roleCode)) {
      if (!ticket.departmentId || userLocation.departmentId === ticket.departmentId) {
        recipients.push({
          recipientType: NotificationRecipientType.USER,
          recipientUserId: user.id,
        })
      }
    }
  }

  return recipients
}

/**
 * Central ticket audience resolver used by all three app surfaces (Web/L1/L3).
 * Resident-side notifications are always raiser-only (family member first,
 * otherwise resident) to avoid noisy household-wide fan-out.
 */
export async function resolveTicketAudience(input: ResolveTicketAudienceInput): Promise<NotificationRecipientInput[]> {
  return [
    ...collectResidentRaiser(input.ticket),
    ...collectOperationalUsers(input.ticket, input.actor),
    ...(await collectLocationManagers(input.ticket)),
    ...(input.extraRecipients || []),
  ]
}
