import { Op } from 'sequelize'
import {
  Asset,
  AssetAssignment,
  AssetItemRequest,
  AssetItemRequestAsset,
  AssetServiceLog,
  AssetServiceLogAsset,
  AssetStatusLog,
  Property,
  User,
  UserDetail,
} from '../models/index.js'
import { ItemRequestReason } from '../enums/asset.enum.js'
import type { AssetTimelineQuery } from '../validations/assetTimeline.validation.js'
import { ASSET_TIMELINE_EVENT_TYPES } from '../validations/assetTimeline.validation.js'
import { buildOriginCenterAssetLocationOr } from './assetTransfer.service.js'

export type AssetTimelineEventType = (typeof ASSET_TIMELINE_EVENT_TYPES)[number]

export interface AssetTimelineUser {
  id: string
  name: string
}

export interface AssetTimelineEvent {
  id: string
  type: AssetTimelineEventType
  title: string
  description: string
  at: string
  createdAt: string
  createdBy: AssetTimelineUser | null
  centerId: string
  centerName?: string
  meta: Record<string, unknown>
}

export interface AssetTimelinePagination {
  total: number
  page: number
  limit: number
  totalPages: number
  hasNext: boolean
  hasPrevious: boolean
}

export interface AssetTimelineCenter {
  id: string
  name: string
}

export interface AssetTimelineResult {
  events: AssetTimelineEvent[]
  pagination: AssetTimelinePagination
  centers?: AssetTimelineCenter[]
  viewMode: 'single_center' | 'all_centers'
  activeCenterId?: string
}

const SOURCE_ROW_LIMIT = 1000

interface PendingEvent extends Omit<AssetTimelineEvent, 'createdBy' | 'centerName'> {
  userId: string | null
}

type CenterSegment = { startMs: number; locationId: string }

export const isSuperAdminViewer = (roles?: string[] | null): boolean =>
  Boolean(roles?.some((r) => String(r).toUpperCase() === 'SUPER_ADMIN'))

async function loadCenterNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))]
  const map = new Map<string, string>()
  if (unique.length === 0) return map
  const rows = await Property.findAll({
    where: { id: { [Op.in]: unique } },
    attributes: ['id', 'property_name'],
  })
  for (const row of rows) map.set(row.id, row.property_name)
  return map
}

async function buildAssetCenterSegments(asset: Asset): Promise<CenterSegment[]> {
  const initial = asset.transferOriginLocationId || asset.locationId
  const segments: CenterSegment[] = [{ startMs: 0, locationId: initial }]

  const links = await AssetItemRequestAsset.findAll({
    where: { assetId: asset.id },
    include: [
      {
        model: AssetItemRequest,
        as: 'itemRequest',
        required: true,
        where: { reason: ItemRequestReason.INTER_CENTER_TRANSFER },
      },
    ],
    order: [['updatedAt', 'ASC']],
  })

  for (const link of links) {
    const req = link.itemRequest
    if (!req?.toLocId) continue
    if (String(link.outboundStatus) !== 'approved') continue
    const outboundAt = toDate(link.outboundDecidedAt || link.updatedAt || req.updatedAt || req.createdAt)
    if (!outboundAt) continue
    segments.push({ startMs: outboundAt.getTime(), locationId: req.toLocId })

    // Destination gate decline returns the asset to the origin center.
    if (String(link.returnStatus) === 'declined') {
      const returnAt = toDate(link.returnDecidedAt || link.updatedAt)
      if (returnAt) {
        segments.push({ startMs: returnAt.getTime(), locationId: req.locId })
      }
    }
  }

  segments.sort((a, b) => a.startMs - b.startMs)
  const deduped: CenterSegment[] = []
  for (const seg of segments) {
    const prev = deduped[deduped.length - 1]
    if (prev && prev.locationId === seg.locationId) continue
    deduped.push(seg)
  }
  return deduped
}

function resolveCenterAtTime(atIso: string, segments: CenterSegment[], fallback: string): string {
  const ms = new Date(atIso).getTime()
  if (Number.isNaN(ms)) return fallback
  let chosen = segments[0]?.locationId || fallback
  for (const seg of segments) {
    if (seg.startMs <= ms) chosen = seg.locationId
    else break
  }
  return chosen
}

function gateEventCenterId(row: AssetItemRequest, phase: 'created' | 'outbound' | 'return'): string {
  if (row.reason === ItemRequestReason.INTER_CENTER_TRANSFER && phase === 'return' && row.toLocId) {
    return row.toLocId
  }
  return row.locId
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function toIso(value: Date | string | null | undefined): string {
  return toDate(value)?.toISOString() ?? ''
}

function joinParts(...parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p ? String(p).trim() : ''))
    .filter(Boolean)
    .join(' · ')
}

function userName(user: User | null | undefined): string | null {
  if (!user) return null
  const profile = user.profile
  const full = profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : ''
  return full || user.username || user.email || null
}

async function loadUsers(ids: Iterable<string>): Promise<Map<string, AssetTimelineUser>> {
  const unique = Array.from(new Set(Array.from(ids).filter(Boolean)))
  const map = new Map<string, AssetTimelineUser>()
  if (unique.length === 0) return map

  const users = await User.findAll({
    where: { id: unique },
    attributes: ['id', 'username', 'email'],
    include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'], required: false }],
  })
  for (const user of users) {
    const name = userName(user)
    if (name) map.set(user.id, { id: user.id, name })
  }
  return map
}

function loadCreated(asset: Asset): PendingEvent[] {
  const at = toIso(asset.createdAt)
  if (!at) return []
  const centerId = asset.transferOriginLocationId || asset.locationId
  return [
    {
      id: `created:${asset.id}`,
      type: 'created',
      title: 'Asset created',
      description: joinParts(
        asset.serialNumber ? `Serial: ${asset.serialNumber}` : null,
        asset.assetTag ? `Tag: ${asset.assetTag}` : null,
        asset.status ? `Initial status: ${asset.status}` : null,
      ),
      at,
      createdAt: at,
      userId: asset.createdBy || null,
      centerId,
      meta: {
        sourceId: asset.id,
        status: asset.status,
        serialNumber: asset.serialNumber,
        assetTag: asset.assetTag,
      },
    },
  ]
}

async function loadAssignments(assetId: string): Promise<PendingEvent[]> {
  const rows = await AssetAssignment.findAll({
    where: { assetId },
    order: [['assignedAt', 'DESC']],
    limit: SOURCE_ROW_LIMIT,
  })

  const events: PendingEvent[] = []
  for (const row of rows) {
    const assignedAt = toIso(row.assignedAt || row.createdAt)
    if (assignedAt) {
      events.push({
        id: `assigned:${row.id}`,
        type: 'assigned',
        title: 'Asset assigned',
        description: joinParts(
          `Assignee type: ${row.assigneeType}`,
          row.notes || null,
          row.expectedReturnDate ? `Expected return: ${toIso(row.expectedReturnDate).slice(0, 10)}` : null,
        ),
        at: assignedAt,
        createdAt: toIso(row.createdAt) || assignedAt,
        userId: row.assignedBy || row.createdBy || null,
        centerId: row.locationId,
        meta: {
          sourceId: row.id,
          assigneeType: row.assigneeType,
          assigneeId: row.assigneeId,
          expectedReturnDate: row.expectedReturnDate,
          notes: row.notes,
        },
      })
    }

    if (row.returnedAt) {
      const returnedAt = toIso(row.returnedAt)
      if (returnedAt) {
        events.push({
          id: `returned:${row.id}`,
          type: 'returned',
          title: 'Asset returned',
          description: joinParts(row.returnCondition ? `Condition: ${row.returnCondition}` : null, row.notes || null),
          at: returnedAt,
          createdAt: toIso(row.updatedAt) || returnedAt,
          userId: row.updatedBy || row.assignedBy || null,
          centerId: row.locationId,
          meta: {
            sourceId: row.id,
            returnCondition: row.returnCondition,
            assigneeType: row.assigneeType,
            assigneeId: row.assigneeId,
          },
        })
      }
    }
  }
  return events
}

async function loadServiceLogs(
  assetId: string,
  segments: CenterSegment[],
  fallbackCenterId: string,
): Promise<PendingEvent[]> {
  // Prefer direct assetId (one log per asset on create); also include junction-linked logs.
  const junctionRows = await AssetServiceLogAsset.findAll({
    where: { assetId },
    attributes: ['assetServiceLogId'],
    limit: SOURCE_ROW_LIMIT,
  })
  const junctionLogIds = junctionRows.map((row) => row.assetServiceLogId).filter(Boolean)

  const rows = await AssetServiceLog.findAll({
    where: {
      serviceType: { [Op.in]: ['repair', 'scrap'] },
      [Op.or]: [{ assetId }, ...(junctionLogIds.length ? [{ id: { [Op.in]: junctionLogIds } }] : [])],
    },
    order: [['serviceDate', 'DESC']],
    limit: SOURCE_ROW_LIMIT,
  })

  const events: PendingEvent[] = []
  for (const row of rows) {
    const type = row.serviceType === 'scrap' ? 'scrap' : 'repair'
    // Use createdAt so "in repair / scrap" appears when status actually changed,
    // not at midnight from the date-only serviceDate field.
    const startedAt = toIso(row.createdAt || row.serviceDate)
    const isPending = row.completionStatus !== 'completed'
    if (startedAt) {
      events.push({
        id: `${type}:${row.id}:started`,
        type,
        title:
          type === 'scrap'
            ? isPending
              ? 'Asset marked as scrap'
              : 'Marked as scrap'
            : isPending
              ? 'Asset in repair'
              : 'Repair started',
        description: joinParts(
          row.performedBy ? `Performed by: ${row.performedBy}` : null,
          row.description || null,
          row.cost != null ? `Cost: ${row.cost}` : null,
          row.serviceDate ? `Service date: ${toIso(row.serviceDate).slice(0, 10)}` : null,
          isPending ? 'Status: in progress' : 'Status: started',
        ),
        at: startedAt,
        createdAt: toIso(row.createdAt) || startedAt,
        userId: row.createdBy || null,
        centerId: resolveCenterAtTime(startedAt, segments, fallbackCenterId),
        meta: {
          sourceId: row.id,
          serviceType: row.serviceType,
          completionStatus: row.completionStatus,
          performedBy: row.performedBy,
          cost: row.cost,
          serviceDate: row.serviceDate,
          phase: 'started',
        },
      })
    }

    if (row.completionStatus === 'completed') {
      const completedAt = toIso(row.completedDate || row.updatedAt)
      if (completedAt) {
        events.push({
          id: `${type}:${row.id}:completed`,
          type,
          title: type === 'scrap' ? 'Scrap completed' : 'Repair completed',
          description: joinParts(
            row.completionRemarks || null,
            type === 'repair' ? 'Asset returned to available' : 'Asset remains scrap',
          ),
          at: completedAt,
          createdAt: toIso(row.updatedAt) || completedAt,
          userId: row.updatedBy || row.createdBy || null,
          centerId: resolveCenterAtTime(completedAt, segments, fallbackCenterId),
          meta: {
            sourceId: row.id,
            serviceType: row.serviceType,
            completionStatus: row.completionStatus,
            completionRemarks: row.completionRemarks,
            phase: 'completed',
          },
        })
      }
    }
  }
  return events
}

async function loadItemRequests(assetId: string): Promise<PendingEvent[]> {
  // Load junction rows for THIS asset so multi-asset gate decisions are tracked per asset.
  const links = await AssetItemRequestAsset.findAll({
    where: { assetId },
    include: [
      {
        model: AssetItemRequest,
        as: 'itemRequest',
        required: true,
      },
    ],
    order: [['createdAt', 'DESC']],
    limit: SOURCE_ROW_LIMIT,
  })

  const actorIds = new Set<string>()
  for (const link of links) {
    if (link.outboundDecidedBy) actorIds.add(link.outboundDecidedBy)
    if (link.returnDecidedBy) actorIds.add(link.returnDecidedBy)
    const req = link.itemRequest
    if (req?.updatedBy) actorIds.add(req.updatedBy)
    if (req?.createdBy) actorIds.add(req.createdBy)
  }
  const decidedUsers = await loadUsers(actorIds)

  const events: PendingEvent[] = []
  for (const link of links) {
    const row = link.itemRequest
    if (!row) continue

    const createdAt = toIso(row.createdAt)
    if (!createdAt) continue

    const isExternal = row.reason === 'external_use'
    const isTransfer = row.reason === ItemRequestReason.INTER_CENTER_TRANSFER
    const createType: AssetTimelineEventType = isTransfer ? 'transfer' : isExternal ? 'external_use' : 'qr_generated'
    const reasonLabel =
      row.reason === 'external_use'
        ? 'External use'
        : row.reason === 'scrap'
          ? 'Scrap'
          : row.reason === ItemRequestReason.INTER_CENTER_TRANSFER
            ? 'Inter-center transfer'
            : 'Repair'

    events.push({
      id: `${createType}:${row.id}:created`,
      type: createType,
      title: isTransfer
        ? 'Inter-center transfer gate pass created'
        : isExternal
          ? 'Gate pass created (external use)'
          : 'Gate pass QR generated',
      description: joinParts(
        `Reason: ${reasonLabel}`,
        `Requester: ${row.name}`,
        row.phone ? `Phone: ${row.phone}` : null,
        row.problem || null,
        row.expectedReturnDate ? `Expected return: ${toIso(row.expectedReturnDate).slice(0, 10)}` : null,
        row.qrCode ? `QR: ${row.qrCode}` : null,
      ),
      at: createdAt,
      createdAt,
      userId: row.createdBy || null,
      centerId: gateEventCenterId(row, 'created'),
      meta: {
        sourceId: row.id,
        linkId: link.id,
        reason: row.reason,
        phase: 'created',
        qrCode: row.qrCode,
        name: row.name,
        phone: row.phone,
        expectedReturnDate: row.expectedReturnDate,
        requestImage: row.requestImage,
      },
    })

    const outboundStatus = String(link.outboundStatus || 'pending')
    const returnStatus = String(link.returnStatus || 'pending')
    const parentStatus = String(row.status)
    const parentDecisionAt = toIso(row.updatedAt) || createdAt
    const linkUpdatedAt = toIso(link.updatedAt) || parentDecisionAt

    // Prefer per-asset junction decisions; fall back to parent status for legacy rows.
    let outboundDecision: 'approved' | 'declined' | 'cancelled' | null =
      outboundStatus === 'approved' ? 'approved' : outboundStatus === 'declined' ? 'declined' : null
    if (!outboundDecision && outboundStatus === 'pending') {
      if (parentStatus === 'declined') outboundDecision = 'declined'
      else if (parentStatus === 'cancelled') outboundDecision = 'cancelled'
      else if (parentStatus === 'approved' || parentStatus === 'returned' || parentStatus === 'return_declined') {
        outboundDecision = 'approved'
      }
    }

    if (outboundDecision === 'cancelled') {
      const actorId = row.updatedBy || null
      const decidedByName = actorId ? decidedUsers.get(actorId)?.name || null : null
      events.push({
        id: `gate_pass_cancelled:${row.id}:${link.id}`,
        type: isTransfer ? 'transfer' : 'gate_pass_cancelled',
        title: isTransfer ? 'Inter-center transfer cancelled' : 'Gate pass cancelled',
        description: joinParts(
          `Reason: ${reasonLabel}`,
          'Asset marked available before outbound',
          decidedByName ? `By: ${decidedByName}` : null,
        ),
        at: parentDecisionAt,
        createdAt: parentDecisionAt,
        userId: actorId,
        centerId: gateEventCenterId(row, 'outbound'),
        meta: {
          sourceId: row.id,
          linkId: link.id,
          reason: row.reason,
          phase: 'outbound',
          status: 'cancelled',
          decidedByName,
          decidedBy: actorId,
        },
      })
    } else if (outboundDecision === 'approved') {
      const actorId = link.outboundDecidedBy || (outboundStatus === 'pending' ? row.updatedBy : null) || null
      const decidedByName = actorId ? decidedUsers.get(actorId)?.name || null : null
      events.push({
        id: `gate_pass_approved:${row.id}:${link.id}`,
        type: isTransfer ? 'transfer' : 'gate_pass_approved',
        title: isTransfer ? 'Transfer outbound approved at gate' : 'Gate pass approved at security',
        description: joinParts(
          `Reason: ${reasonLabel}`,
          isTransfer ? 'Asset moved to destination center' : null,
          decidedByName ? `By: ${decidedByName}` : null,
        ),
        at: outboundStatus === 'approved' ? linkUpdatedAt : parentDecisionAt,
        createdAt: outboundStatus === 'approved' ? linkUpdatedAt : parentDecisionAt,
        userId: actorId,
        centerId: gateEventCenterId(row, 'outbound'),
        meta: {
          sourceId: row.id,
          linkId: link.id,
          reason: row.reason,
          phase: 'outbound',
          status: 'approved',
          decidedByName,
          decidedBy: actorId,
        },
      })
    } else if (outboundDecision === 'declined') {
      const actorId = link.outboundDecidedBy || (outboundStatus === 'pending' ? row.updatedBy : null) || null
      const decidedByName = actorId ? decidedUsers.get(actorId)?.name || null : null
      events.push({
        id: `gate_pass_declined:${row.id}:${link.id}`,
        type: isTransfer ? 'transfer' : 'gate_pass_declined',
        title: isTransfer ? 'Transfer outbound declined at gate' : 'Gate pass declined at security',
        description: joinParts(
          `Reason: ${reasonLabel}`,
          decidedByName ? `By: ${decidedByName}` : null,
          row.declineComment || null,
        ),
        at: outboundStatus === 'declined' ? linkUpdatedAt : parentDecisionAt,
        createdAt: outboundStatus === 'declined' ? linkUpdatedAt : parentDecisionAt,
        userId: actorId,
        centerId: gateEventCenterId(row, 'outbound'),
        meta: {
          sourceId: row.id,
          linkId: link.id,
          reason: row.reason,
          phase: 'outbound',
          status: 'declined',
          decidedByName,
          decidedBy: actorId,
          declineComment: row.declineComment,
          declineImage: row.declineImage,
        },
      })
    }

    // Return phase only applies when this asset cleared outbound (not declined).
    if (outboundDecision === 'declined' || row.reason === 'scrap') {
      continue
    }

    let returnDecision: 'approved' | 'declined' | null =
      returnStatus === 'approved' ? 'approved' : returnStatus === 'declined' ? 'declined' : null
    if (!returnDecision && returnStatus === 'pending') {
      if (parentStatus === 'returned') returnDecision = 'approved'
      else if (parentStatus === 'return_declined') returnDecision = 'declined'
    }

    if (returnDecision === 'approved') {
      const actorId = link.returnDecidedBy || (returnStatus === 'pending' ? row.updatedBy : null) || null
      const decidedByName = actorId ? decidedUsers.get(actorId)?.name || null : null
      events.push({
        id: `gate_return_approved:${row.id}:${link.id}`,
        type: isTransfer ? 'transfer' : 'gate_return_approved',
        title: isTransfer ? 'Transfer inward approved at destination' : 'Return approved at gate',
        description: joinParts(
          `Reason: ${reasonLabel}`,
          decidedByName ? `By: ${decidedByName}` : null,
          isTransfer ? 'Asset awaiting acceptance at destination center' : 'Asset moved to pending inspection',
        ),
        at: returnStatus === 'approved' ? linkUpdatedAt : parentDecisionAt,
        createdAt: returnStatus === 'approved' ? linkUpdatedAt : parentDecisionAt,
        userId: actorId,
        centerId: gateEventCenterId(row, 'return'),
        meta: {
          sourceId: row.id,
          linkId: link.id,
          reason: row.reason,
          phase: 'return',
          status: 'approved',
          decidedByName,
          decidedBy: actorId,
        },
      })
    } else if (returnDecision === 'declined') {
      const actorId = link.returnDecidedBy || (returnStatus === 'pending' ? row.updatedBy : null) || null
      const decidedByName = actorId ? decidedUsers.get(actorId)?.name || null : null
      events.push({
        id: `gate_return_declined:${row.id}:${link.id}`,
        type: isTransfer ? 'transfer' : 'gate_return_declined',
        title: isTransfer ? 'Transfer inward declined at destination' : 'Return declined at gate',
        description: joinParts(
          `Reason: ${reasonLabel}`,
          decidedByName ? `By: ${decidedByName}` : null,
          row.returnDeclineComment || row.declineComment || null,
          isTransfer ? 'Asset returned to origin for inspection' : null,
        ),
        at: returnStatus === 'declined' ? linkUpdatedAt : parentDecisionAt,
        createdAt: returnStatus === 'declined' ? linkUpdatedAt : parentDecisionAt,
        userId: actorId,
        centerId: gateEventCenterId(row, 'return'),
        meta: {
          sourceId: row.id,
          linkId: link.id,
          reason: row.reason,
          phase: 'return',
          status: 'declined',
          decidedByName,
          decidedBy: actorId,
          returnDeclineComment: row.returnDeclineComment,
          returnDeclineImage: row.returnDeclineImage,
        },
      })
    }
  }
  return events
}

async function loadStatusLogs(
  assetId: string,
  segments: CenterSegment[],
  fallbackCenterId: string,
): Promise<PendingEvent[]> {
  const rows = await AssetStatusLog.findAll({
    where: { assetId },
    order: [['createdAt', 'DESC']],
    limit: SOURCE_ROW_LIMIT,
  })

  const events: PendingEvent[] = []
  for (const row of rows) {
    const at = toIso(row.createdAt)
    if (!at) continue

    const note = row.note || ''
    // Covered by per-asset gate timeline events — avoid duplicates.
    if (
      note.includes('Outbound gate pass declined') ||
      note.includes('Return approved at gate') ||
      note.includes('Inter-center transfer gate pass created') ||
      note.includes('Inter-center transfer outbound approved') ||
      note.includes('Inter-center transfer inward approved') ||
      note.includes('Inter-center transfer outbound declined')
    ) {
      continue
    }

    const centerId = resolveCenterAtTime(at, segments, fallbackCenterId)
    const baseMeta = {
      sourceId: row.id,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      note: row.note,
      documentUrl: row.documentUrl || null,
    }

    const isTransferAccepted =
      note.includes('Inter-center transfer accepted') ||
      (row.fromStatus === 'pending_transfer_acceptance' &&
        (row.toStatus === 'available' || row.toStatus === 'maintenance'))
    const isTransferRejected = note.includes('Inter-center transfer rejected') || row.toStatus === 'transfer_rejected'

    if (isTransferAccepted) {
      events.push({
        id: `transfer:${row.id}:accepted`,
        type: 'transfer',
        title: 'Inter-center transfer accepted',
        description: joinParts(`From ${row.fromStatus} to ${row.toStatus}`, row.note || null),
        at,
        createdAt: at,
        userId: row.createdBy || null,
        centerId,
        meta: { ...baseMeta, phase: 'accepted' },
      })
      continue
    }

    if (isTransferRejected) {
      events.push({
        id: `transfer:${row.id}:rejected`,
        type: 'transfer',
        title: 'Inter-center transfer rejected',
        description: joinParts(`From ${row.fromStatus} to ${row.toStatus}`, row.note || null),
        at,
        createdAt: at,
        userId: row.createdBy || null,
        centerId,
        meta: { ...baseMeta, phase: 'rejected' },
      })
      continue
    }

    const isReturnedToOriginAfterInwardDecline =
      note.includes('Inter-center transfer inward declined — returned to origin') ||
      (row.toStatus === 'pending_inspection' &&
        (row.fromStatus === 'inter_center_incoming' || row.fromStatus === 'pending_transfer_acceptance') &&
        note.includes('returned to origin'))

    if (isReturnedToOriginAfterInwardDecline) {
      events.push({
        id: `transfer:${row.id}:returned_to_origin`,
        type: 'transfer',
        title: 'Returned to origin after destination gate decline',
        description: joinParts(`From ${row.fromStatus} to ${row.toStatus}`, row.note || null),
        at,
        createdAt: at,
        userId: row.createdBy || null,
        centerId,
        meta: { ...baseMeta, phase: 'returned_to_origin' },
      })
      continue
    }

    const isMadeAvailable =
      row.toStatus === 'available' && (row.fromStatus === 'external_use' || row.fromStatus === 'pending_inspection')
    if (!isMadeAvailable) continue

    events.push({
      id: `made_available:${row.id}`,
      type: 'made_available',
      title: 'Marked as available',
      description: joinParts(`From ${row.fromStatus} to ${row.toStatus}`, row.note || null),
      at,
      createdAt: at,
      userId: row.createdBy || null,
      centerId,
      meta: baseMeta,
    })
  }
  return events
}

/**
 * Builds an asset's lifecycle timeline from assignments, service logs,
 * item requests, status logs, and the asset create record. Newest first.
 */
export async function getAssetTimeline(
  assetId: string,
  query: AssetTimelineQuery,
  locationId?: string | null,
  viewerRoles?: string[] | null,
): Promise<AssetTimelineResult> {
  let assetWhere: Record<string, unknown> = { id: assetId }
  if (locationId && locationId !== 'all') {
    const locationOr = await buildOriginCenterAssetLocationOr(locationId)
    assetWhere = {
      id: assetId,
      [Op.and]: [{ [Op.or]: locationOr }],
    }
  }

  const asset = await Asset.findOne({ where: assetWhere })
  if (!asset) {
    const err = new Error('Asset not found') as Error & { statusCode?: number }
    err.statusCode = 404
    throw err
  }

  const { type, types } = query
  const page = query.page ?? 1
  const limit = query.limit ?? 25
  const selected = new Set<AssetTimelineEventType>([...(types ?? []), ...(type ? [type] : [])])
  const wants = (t: AssetTimelineEventType) => selected.size === 0 || selected.has(t)

  const segments = await buildAssetCenterSegments(asset)
  const fallbackCenterId = asset.transferOriginLocationId || asset.locationId

  const [assignments, serviceLogs, itemRequests, statusLogs] = await Promise.all([
    wants('assigned') || wants('returned') ? loadAssignments(assetId) : [],
    wants('repair') || wants('scrap') ? loadServiceLogs(assetId, segments, fallbackCenterId) : [],
    wants('external_use') ||
    wants('qr_generated') ||
    wants('transfer') ||
    wants('gate_pass_approved') ||
    wants('gate_pass_declined') ||
    wants('gate_pass_cancelled') ||
    wants('gate_return_approved') ||
    wants('gate_return_declined')
      ? loadItemRequests(assetId)
      : [],
    wants('made_available') || wants('transfer') ? loadStatusLogs(assetId, segments, fallbackCenterId) : [],
  ])

  let pending = [
    ...(wants('created') ? loadCreated(asset) : []),
    ...assignments.filter((e) => wants(e.type)),
    ...serviceLogs.filter((e) => wants(e.type)),
    ...itemRequests.filter((e) => wants(e.type)),
    ...statusLogs.filter((e) => wants(e.type)),
  ].filter((e) => Boolean(e.at) && Boolean(e.centerId))

  const superAdmin = isSuperAdminViewer(viewerRoles)
  const viewerLoc = locationId && locationId !== 'all' ? String(locationId) : null

  const centerIdsBeforeFilter = [...new Set(pending.map((e) => e.centerId))]
  const centerNamesAll = await loadCenterNames(centerIdsBeforeFilter)
  const centers: AssetTimelineCenter[] = centerIdsBeforeFilter.map((id) => ({
    id,
    name: centerNamesAll.get(id) || 'Center',
  }))

  const scopeCenterId = query.centerScopeId?.trim() || null
  let activeCenterId: string | undefined

  if (!superAdmin && viewerLoc) {
    pending = pending.filter((e) => e.centerId === viewerLoc)
    activeCenterId = viewerLoc
  } else if (superAdmin && scopeCenterId) {
    pending = pending.filter((e) => e.centerId === scopeCenterId)
    activeCenterId = scopeCenterId
  } else if (superAdmin && viewerLoc) {
    activeCenterId = viewerLoc
  }

  pending.sort((a, b) => {
    const diff = new Date(b.at).getTime() - new Date(a.at).getTime()
    if (diff !== 0) return diff
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  })

  const total = pending.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const offset = (page - 1) * limit
  const pageItems = pending.slice(offset, offset + limit)

  const pageCenterIds = [...new Set(pageItems.map((e) => e.centerId))]
  const pageCenterNames = await loadCenterNames(pageCenterIds)

  const users = await loadUsers(pageItems.map((e) => e.userId).filter((id): id is string => Boolean(id)))
  const events: AssetTimelineEvent[] = pageItems.map(({ userId, ...rest }) => ({
    ...rest,
    centerName: pageCenterNames.get(rest.centerId) || 'Center',
    createdBy: userId ? (users.get(userId) ?? null) : null,
  }))

  return {
    events,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNext: offset + limit < total,
      hasPrevious: page > 1,
    },
    viewMode: superAdmin ? 'all_centers' : 'single_center',
    ...(superAdmin ? { centers } : {}),
    ...(activeCenterId ? { activeCenterId } : {}),
  }
}
