import { Op, Sequelize } from 'sequelize'
import {
  Asset,
  AssetAssignment,
  AssetItemRequest,
  AssetServiceLog,
  AssetStatusLog,
  User,
  UserDetail,
} from '../models/index.js'
import type { AssetTimelineQuery } from '../validations/assetTimeline.validation.js'
import { ASSET_TIMELINE_EVENT_TYPES } from '../validations/assetTimeline.validation.js'

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

export interface AssetTimelineResult {
  events: AssetTimelineEvent[]
  pagination: AssetTimelinePagination
}

const SOURCE_ROW_LIMIT = 1000

interface PendingEvent extends Omit<AssetTimelineEvent, 'createdBy'> {
  userId: string | null
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

async function loadServiceLogs(assetId: string): Promise<PendingEvent[]> {
  const rows = await AssetServiceLog.findAll({
    where: {
      assetId,
      serviceType: { [Op.in]: ['repair', 'scrap'] },
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
  const rows = await AssetItemRequest.findAll({
    where: Sequelize.where(Sequelize.fn('JSON_CONTAINS', Sequelize.col('assetIds'), JSON.stringify(assetId)), 1),
    order: [['createdAt', 'DESC']],
    limit: SOURCE_ROW_LIMIT,
  })

  const decidedUserIds = rows
    .filter((row) => row.status === 'approved' || row.status === 'declined')
    .map((row) => row.updatedBy)
    .filter((id): id is string => Boolean(id))
  const decidedUsers = await loadUsers(decidedUserIds)

  const events: PendingEvent[] = []
  for (const row of rows) {
    const at = toIso(row.createdAt)
    if (!at) continue

    const isExternal = row.reason === 'external_use'
    const type: AssetTimelineEventType = isExternal ? 'external_use' : 'qr_generated'
    const reasonLabel = row.reason === 'external_use' ? 'External use' : row.reason === 'scrap' ? 'Scrap' : 'Repair'
    const isApproved = row.status === 'approved'
    const isDeclined = row.status === 'declined'
    const decidedByName =
      (isApproved || isDeclined) && row.updatedBy ? decidedUsers.get(row.updatedBy)?.name || null : null

    events.push({
      id: `${type}:${row.id}`,
      type,
      title: isExternal ? 'Marked for external use' : 'Gate pass QR generated',
      description: joinParts(
        `Reason: ${reasonLabel}`,
        `Requester: ${row.name}`,
        row.phone ? `Phone: ${row.phone}` : null,
        row.problem || null,
        row.expectedReturnDate ? `Expected return: ${toIso(row.expectedReturnDate).slice(0, 10)}` : null,
        row.qrCode ? `QR: ${row.qrCode}` : null,
        `Request status: ${row.status}`,
      ),
      at,
      createdAt: at,
      userId: row.createdBy || null,
      meta: {
        sourceId: row.id,
        reason: row.reason,
        status: row.status,
        qrCode: row.qrCode,
        name: row.name,
        phone: row.phone,
        expectedReturnDate: row.expectedReturnDate,
        requestImage: row.requestImage,
        decidedByName,
        decidedBy: row.updatedBy || null,
      },
    })
  }
  return events
}

async function loadStatusLogs(assetId: string): Promise<PendingEvent[]> {
  const rows = await AssetStatusLog.findAll({
    where: { assetId },
    order: [['createdAt', 'DESC']],
    limit: SOURCE_ROW_LIMIT,
  })

  const events: PendingEvent[] = []
  for (const row of rows) {
    const at = toIso(row.createdAt)
    if (!at) continue

    const isMadeAvailable = row.toStatus === 'available' && row.fromStatus === 'external_use'
    if (!isMadeAvailable) continue

    events.push({
      id: `made_available:${row.id}`,
      type: 'made_available',
      title: 'Marked as available',
      description: joinParts(`From ${row.fromStatus} to ${row.toStatus}`, row.note || null),
      at,
      createdAt: at,
      userId: row.createdBy || null,
      meta: {
        sourceId: row.id,
        fromStatus: row.fromStatus,
        toStatus: row.toStatus,
        note: row.note,
      },
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
): Promise<AssetTimelineResult> {
  const assetWhere: Record<string, unknown> = { id: assetId }
  if (locationId && locationId !== 'all') {
    assetWhere.locationId = locationId
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

  const [assignments, serviceLogs, itemRequests, statusLogs] = await Promise.all([
    wants('assigned') || wants('returned') ? loadAssignments(assetId) : [],
    wants('repair') || wants('scrap') ? loadServiceLogs(assetId) : [],
    wants('external_use') || wants('qr_generated') ? loadItemRequests(assetId) : [],
    wants('made_available') ? loadStatusLogs(assetId) : [],
  ])

  const pending = [
    ...(wants('created') ? loadCreated(asset) : []),
    ...assignments.filter((e) => wants(e.type)),
    ...serviceLogs.filter((e) => wants(e.type)),
    ...itemRequests.filter((e) => wants(e.type)),
    ...statusLogs,
  ].filter((e) => Boolean(e.at))

  pending.sort((a, b) => {
    const diff = new Date(b.at).getTime() - new Date(a.at).getTime()
    if (diff !== 0) return diff
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  })

  const total = pending.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const offset = (page - 1) * limit
  const pageItems = pending.slice(offset, offset + limit)

  const users = await loadUsers(pageItems.map((e) => e.userId).filter((id): id is string => Boolean(id)))
  const events: AssetTimelineEvent[] = pageItems.map(({ userId, ...rest }) => ({
    ...rest,
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
  }
}
