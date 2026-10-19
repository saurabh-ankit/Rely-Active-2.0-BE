import {
  NotificationActionType,
  NotificationActorType,
  NotificationModule,
  NotificationRecipientType,
  NotificationSeverity,
} from '../../enums/notification.enum.js'
import { GateEntry, PropertyUnit, Resident, ResidentFamilyMember, User, UserDetail } from '../../models/index.js'
import { createNotificationEvent, type NotificationRecipientInput } from './notification.service.js'
import type { NotificationActorInput } from './notificationAudience.service.js'

export const GATE_EVENTS = {
  /** Guard raised a walk-in: the household approves or denies (popup / Approve-Deny notification). */
  APPROVAL_REQUESTED: 'GATE_VISITOR_APPROVAL_REQUESTED',
  /** Sent to the rest of the household once someone decided, so their popup closes. */
  DECIDED: 'GATE_VISITOR_DECIDED',
  /** Sent to the guard who raised the walk-in. */
  APPROVED: 'GATE_VISITOR_APPROVED',
  REJECTED: 'GATE_VISITOR_REJECTED',
} as const

export type GateDecision = 'Approved' | 'Rejected'

/** Who in the household made the decision (excluded from the "decided" follow-up). */
export interface GateDecider {
  residentId?: string | null
  familyMemberId?: string | null
  name: string | null
}

const fullName = (first?: string | null, last?: string | null) => `${first ?? ''} ${last ?? ''}`.trim()

/** The flat's residing resident(s) and their residing family members. */
async function householdOf(unitId: string): Promise<NotificationRecipientInput[]> {
  const residents = await Resident.findAll({
    where: { unitId, isResiding: true, isDeleted: false },
    attributes: ['id'],
    include: [
      {
        model: ResidentFamilyMember,
        as: 'familyMembers',
        attributes: ['id'],
        where: { isDeleted: false, isResiding: true },
        required: false,
      },
    ],
  })
  return residents.flatMap((r) => [
    { recipientType: NotificationRecipientType.RESIDENT, recipientResidentId: r.id },
    ...((r as Resident & { familyMembers?: ResidentFamilyMember[] }).familyMembers ?? []).map((f) => ({
      recipientType: NotificationRecipientType.FAMILY_MEMBER,
      recipientFamilyMemberId: f.id,
    })),
  ])
}

async function staffName(userId?: string | null): Promise<string | null> {
  if (!userId) return null
  const user = (await User.findByPk(userId, {
    attributes: ['id', 'username'],
    include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
  })) as (User & { profile?: UserDetail | null }) | null
  return fullName(user?.profile?.firstName, user?.profile?.lastName) || user?.username || null
}

/** "Rahul" / "Rahul +2" for a request with several visitors. */
const visitorsLabel = (entries: GateEntry[]) => {
  const first = entries[0]?.visitorName || 'A visitor'
  return entries.length > 1 ? `${first} +${entries.length - 1}` : first
}

/** "Delivery – Amazon", "Guest", … */
const visitorKind = (entry: GateEntry) => [entry.visitorType, entry.company].filter(Boolean).join(' – ') || 'Visitor'

/** What the apps need to show the approval popup without another request. */
const requestPayload = (entries: GateEntry[], unitNumber: string | null, guardName: string | null) => {
  const first = entries[0]!
  const photos = Array.isArray(first.visitorPhotos) ? (first.visitorPhotos as string[]) : []
  return {
    entryIds: entries.map((e) => e.id),
    visitors: entries.map((e) => ({ name: e.visitorName, phone: e.visitorPhone })),
    visitorType: first.visitorType ?? null,
    company: first.company ?? null,
    vehicleNumber: first.vehicleNumber ?? null,
    photoUrl: photos[0] ?? null,
    unitId: first.unitId ?? null,
    unitNumber,
    guardName,
    requestedAt: (first.createdAt ?? new Date()).toISOString(),
  }
}

/**
 * A guard raised a walk-in for a flat: everyone residing there is asked to approve or deny.
 * One request covers every visitor the guard entered together.
 */
export async function publishGateApprovalRequest(entries: GateEntry[], guardUserId?: string | null): Promise<void> {
  const first = entries[0]
  if (!first?.unitId) return
  const recipients = await householdOf(first.unitId)
  if (!recipients.length) return

  const [unit, guardName] = await Promise.all([
    PropertyUnit.findByPk(first.unitId, { attributes: ['id', 'unit_number'] }),
    staffName(guardUserId),
  ])
  const unitNumber = (unit as (PropertyUnit & { unit_number?: string }) | null)?.unit_number ?? null
  const actor: NotificationActorInput | null = guardUserId
    ? { actorType: NotificationActorType.USER, actorUserId: guardUserId, actorName: guardName || 'Security' }
    : null

  await createNotificationEvent({
    module: NotificationModule.GATE,
    eventCode: GATE_EVENTS.APPROVAL_REQUESTED,
    entityType: 'GATE_ENTRY',
    entityId: first.id,
    entityLabel: visitorsLabel(entries),
    locationId: first.locId ?? null,
    actor,
    title: 'Visitor at the gate',
    message: `${visitorsLabel(entries)} (${visitorKind(first)}) is waiting${unitNumber ? ` for Flat ${unitNumber}` : ''}. Approve or deny?`,
    actionType: NotificationActionType.OPEN_ENTITY,
    severity: NotificationSeverity.WARNING,
    payload: requestPayload(entries, unitNumber, guardName),
    recipients,
    createdBy: guardUserId ?? null,
  })
}

/**
 * The household approved or denied: the guard who raised the walk-in is told, and the rest of
 * the household gets a follow-up so their approval popup / notification goes away.
 */
export async function publishGateDecision(
  entries: GateEntry[],
  decision: GateDecision,
  decider: GateDecider,
): Promise<void> {
  const first = entries[0]
  if (!first) return
  const who = decider.name || 'the resident'
  const label = visitorsLabel(entries)
  const approved = decision === 'Approved'
  const unit = first.unitId ? await PropertyUnit.findByPk(first.unitId, { attributes: ['id', 'unit_number'] }) : null
  const unitNumber = (unit as (PropertyUnit & { unit_number?: string }) | null)?.unit_number ?? null
  const payload = { ...requestPayload(entries, unitNumber, null), decision, decidedBy: decider.name }
  const actor: NotificationActorInput = decider.familyMemberId
    ? { actorType: NotificationActorType.FAMILY_MEMBER, actorFamilyMemberId: decider.familyMemberId, actorName: who }
    : { actorType: NotificationActorType.RESIDENT, actorResidentId: decider.residentId ?? null, actorName: who }

  const guardIds = Array.from(new Set(entries.map((e) => e.createdBy).filter((id): id is string => Boolean(id))))
  if (guardIds.length) {
    await createNotificationEvent({
      module: NotificationModule.GATE,
      eventCode: approved ? GATE_EVENTS.APPROVED : GATE_EVENTS.REJECTED,
      entityType: 'GATE_ENTRY',
      entityId: first.id,
      entityLabel: label,
      locationId: first.locId ?? null,
      actor,
      title: approved ? 'Visitor approved' : 'Visitor denied',
      message: approved
        ? `${label}${unitNumber ? ` for Flat ${unitNumber}` : ''} was approved by ${who}. Allow entry.`
        : `${label}${unitNumber ? ` for Flat ${unitNumber}` : ''} was denied by ${who}. Do not allow entry.`,
      severity: approved ? NotificationSeverity.INFO : NotificationSeverity.WARNING,
      payload,
      recipients: guardIds.map((id) => ({ recipientType: NotificationRecipientType.USER, recipientUserId: id })),
    })
  }

  if (!first.unitId) return
  const others = (await householdOf(first.unitId)).filter(
    (r) =>
      !(decider.familyMemberId && r.recipientFamilyMemberId === decider.familyMemberId) &&
      !(!decider.familyMemberId && decider.residentId && r.recipientResidentId === decider.residentId),
  )
  if (!others.length) return
  await createNotificationEvent({
    module: NotificationModule.GATE,
    eventCode: GATE_EVENTS.DECIDED,
    entityType: 'GATE_ENTRY',
    entityId: first.id,
    entityLabel: label,
    locationId: first.locId ?? null,
    actor,
    title: approved ? 'Visitor approved' : 'Visitor denied',
    message: `${label} was ${approved ? 'approved' : 'denied'} by ${who}.`,
    payload,
    recipients: others,
  })
}

export async function publishGateApprovalRequestSafe(entries: GateEntry[], guardUserId?: string | null) {
  try {
    await publishGateApprovalRequest(entries, guardUserId)
  } catch (error) {
    console.error('Failed to publish gate approval notification:', error)
  }
}

export async function publishGateDecisionSafe(entries: GateEntry[], decision: GateDecision, decider: GateDecider) {
  try {
    await publishGateDecision(entries, decision, decider)
  } catch (error) {
    console.error('Failed to publish gate decision notification:', error)
  }
}
