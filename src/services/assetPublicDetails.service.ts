import { Op, Sequelize } from 'sequelize'
import { AssetAssignment, AssetItemRequest } from '../models/index.js'
import { AssetStatus, ItemRequestReason } from '../enums/asset.enum.js'
import { resolveAssigneeDetails } from './assetAssignmentEnrichment.service.js'

export type PublicAssignmentDetails = {
  assigneeType: 'employee' | 'resident' | 'flat'
  assigneeName: string
  assigneePhone?: string | null
  assigneeEmail?: string | null
  flatInfo?: string | null
  assignedAt: string
  expectedReturnDate?: string | null
  notes?: string | null
}

export type PublicExternalUseDetails = {
  holderName: string
  holderPhone: string
  description?: string | null
  expectedReturnDate?: string | null
  recordedAt: string
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export async function loadActiveAssignment(assetId: string): Promise<PublicAssignmentDetails | null> {
  const assignment = await AssetAssignment.findOne({
    where: {
      assetId,
      returnedAt: { [Op.is]: null },
    },
    order: [['assignedAt', 'DESC']],
  })

  if (!assignment) return null

  const assigneeType = assignment.assigneeType as 'employee' | 'resident' | 'flat'
  const details = await resolveAssigneeDetails(assigneeType, assignment.assigneeId)

  const assignedAt = toIsoString(assignment.assignedAt)
  if (!assignedAt) return null

  return {
    assigneeType,
    assigneeName: details?.name || 'Unknown',
    assigneePhone: details?.phone ?? null,
    assigneeEmail: details?.email ?? null,
    flatInfo: details?.flatInfo ?? null,
    assignedAt,
    expectedReturnDate: toIsoString(assignment.expectedReturnDate),
    notes: assignment.notes ?? null,
  }
}

export async function loadExternalUseDetails(assetId: string): Promise<PublicExternalUseDetails | null> {
  const row = await AssetItemRequest.findOne({
    where: {
      reason: ItemRequestReason.EXTERNAL_USE,
      [Op.and]: Sequelize.where(Sequelize.fn('JSON_CONTAINS', Sequelize.col('assetIds'), JSON.stringify(assetId)), 1),
    },
    order: [['createdAt', 'DESC']],
  })

  if (!row) return null

  const recordedAt = toIsoString(row.createdAt)
  if (!recordedAt) return null

  return {
    holderName: row.name,
    holderPhone: row.phone,
    description: row.problem ?? null,
    expectedReturnDate: toIsoString(row.expectedReturnDate),
    recordedAt,
  }
}

export async function enrichPublicAssetContext(assetId: string, status: AssetStatus) {
  if (status === AssetStatus.ASSIGNED) {
    const assignment = await loadActiveAssignment(assetId)
    return { assignment, externalUse: null as PublicExternalUseDetails | null }
  }

  if (status === AssetStatus.EXTERNAL_USE) {
    const externalUse = await loadExternalUseDetails(assetId)
    return { assignment: null as PublicAssignmentDetails | null, externalUse }
  }

  return { assignment: null, externalUse: null }
}
