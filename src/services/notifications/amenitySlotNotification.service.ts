import { NotificationActionType, NotificationModule, NotificationRecipientType } from '../../enums/notification.enum.js'
import { formatMinutesToAmPm } from '../../utils/amenitySlot.util.js'
import type { NotificationActorInput } from './notificationAudience.service.js'
import { createNotificationEvent, type NotificationRecipientInput } from './notification.service.js'

export interface PublishAmenitySlotBookedNotificationInput {
  locationId: string
  amenityId: string
  amenityName: string
  date: string
  startMinutes: number
  /** The household's resident (notified, and billed for the booking). */
  residentId: string
  /** Set when the booking is for a family member, who is notified too. */
  familyMemberId?: string | null
  /** Name of the person the booking is for. */
  residentName: string
  adminUserId?: string | null
  actor?: NotificationActorInput | null
}

function collectAmenityBookingRecipients(
  input: PublishAmenitySlotBookedNotificationInput,
): NotificationRecipientInput[] {
  const recipients: NotificationRecipientInput[] = [
    {
      recipientType: NotificationRecipientType.RESIDENT,
      recipientResidentId: input.residentId,
    },
  ]
  if (input.familyMemberId) {
    recipients.push({
      recipientType: NotificationRecipientType.FAMILY_MEMBER,
      recipientFamilyMemberId: input.familyMemberId,
    })
  }

  if (input.adminUserId) {
    recipients.push({
      recipientType: NotificationRecipientType.USER,
      recipientUserId: input.adminUserId,
    })
  }

  return recipients
}

export async function publishAmenitySlotBookedNotification(
  input: PublishAmenitySlotBookedNotificationInput,
): Promise<void> {
  const recipients = collectAmenityBookingRecipients(input)
  if (recipients.length === 0) return

  const slotLabel = formatMinutesToAmPm(input.startMinutes)
  const bookerKey = input.familyMemberId || input.residentId
  await createNotificationEvent({
    module: NotificationModule.AMENITIES,
    eventCode: 'AMENITY_SLOT_BOOKED',
    entityType: 'AMENITY_SLOT_BOOKING',
    entityId: `${input.amenityId}:${input.date}:${input.startMinutes}:${bookerKey}`,
    entityLabel: input.amenityName,
    locationId: input.locationId,
    actor: input.actor || null,
    title: `${input.amenityName} slot booked`,
    message: `${input.residentName} has a booking on ${input.date} at ${slotLabel}.`,
    actionType: NotificationActionType.OPEN_URL,
    actionValue: '/admin/amenities',
    payload: {
      amenityId: input.amenityId,
      amenityName: input.amenityName,
      residentId: input.residentId,
      familyMemberId: input.familyMemberId ?? null,
      residentName: input.residentName,
      date: input.date,
      startMinutes: input.startMinutes,
      startLabel: slotLabel,
    },
    dedupeKey: `amenity-slot-booked:${input.amenityId}:${input.date}:${input.startMinutes}:${bookerKey}`,
    recipients,
    createdBy: input.actor?.actorUserId || input.adminUserId || null,
  })
}

export async function publishAmenitySlotBookedNotificationSafe(
  input: PublishAmenitySlotBookedNotificationInput,
): Promise<void> {
  try {
    await publishAmenitySlotBookedNotification(input)
  } catch (error) {
    console.error('Failed to publish amenity slot booking notification:', error)
  }
}
