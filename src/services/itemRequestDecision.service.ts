import type { Transaction } from 'sequelize'
import { Op } from 'sequelize'
import sequelize from '../config/db/index.js'
import {
  Asset,
  AssetItem,
  AssetItemRequest,
  AssetItemRequestAsset,
  AssetStatusLog,
  User,
  UserDetail,
} from '../models/index.js'
import { ensureMinimalCatalogLinksForTransfer, loadLocationNamesForItemRequest } from './assetTransfer.service.js'
import { AssetStatus, ItemRequestAssetGateStatus, ItemRequestReason, ItemRequestStatus } from '../enums/asset.enum.js'
import { uploadBase64ToS3 } from '../middlewares/s3/index.js'

export type ItemRequestScanPhase = 'outbound' | 'return' | 'readonly'

export type EnrichedItemRequestAsset = {
  id: string
  name: string
  serialNumber?: string | null
  assetTag?: string | null
  status?: string | null
  outboundStatus?: ItemRequestAssetGateStatus | string
  returnStatus?: ItemRequestAssetGateStatus | string
  outboundDecidedByName?: string | null
  returnDecidedByName?: string | null
  outboundDecidedAt?: string | null
  returnDecidedAt?: string | null
}

const toIsoOrNull = (value?: Date | string | null) => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

type JunctionRow = AssetItemRequestAsset & {
  asset?: Asset & { item?: AssetItem | null }
}

const normalizeAssetIds = (raw: unknown): string[] => {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((id) => String(id).trim()).filter(Boolean))]
  }
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()]
  return []
}

export const resolveItemRequestScanPhase = (itemRequest: {
  status: ItemRequestStatus | string
  reason: ItemRequestReason | string
}): ItemRequestScanPhase => {
  if (itemRequest.status === ItemRequestStatus.PENDING) {
    return 'outbound'
  }
  if (itemRequest.status === ItemRequestStatus.APPROVED && itemRequest.reason !== ItemRequestReason.SCRAP) {
    return 'return'
  }
  return 'readonly'
}

/** Gate phase visible to a scanner at a specific center (inter-center: outbound @ from, inward @ to). */
export const resolveEffectiveScanPhase = (
  itemRequest: AssetItemRequest,
  scannerLocId?: string | null,
): ItemRequestScanPhase => {
  const base = resolveItemRequestScanPhase(itemRequest)
  if (!scannerLocId) return base

  if (itemRequest.reason === ItemRequestReason.INTER_CENTER_TRANSFER) {
    if (base === 'outbound' && scannerLocId !== itemRequest.locId) return 'readonly'
    if (base === 'return' && scannerLocId !== itemRequest.toLocId) return 'readonly'
    return base
  }

  if (base === 'outbound' || base === 'return') {
    if (scannerLocId !== itemRequest.locId) return 'readonly'
  }
  return base
}

const loadJunctionRows = async (itemRequestId: string): Promise<JunctionRow[]> => {
  return AssetItemRequestAsset.findAll({
    where: { assetItemRequestId: itemRequestId },
    order: [
      ['createdAt', 'ASC'],
      ['id', 'ASC'],
    ],
    include: [
      {
        model: Asset,
        as: 'asset',
        attributes: ['id', 'serialNumber', 'assetTag', 'itemId', 'status'],
        required: false,
        include: [
          {
            model: AssetItem,
            as: 'item',
            attributes: ['id', 'name'],
            required: false,
          },
        ],
      },
    ],
  }) as Promise<JunctionRow[]>
}

const resolveUserDisplayName = async (userId?: string | null): Promise<string | null> => {
  if (!userId) return null
  const user = await User.findByPk(userId, {
    attributes: ['id', 'username'],
    include: [
      {
        model: UserDetail,
        as: 'profile',
        attributes: ['firstName', 'lastName'],
        required: false,
      },
    ],
  })
  if (!user) return null
  const profile = user.profile
  const fullName = profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : ''
  return fullName || user.username || null
}

const resolveDeclineImage = async (image?: string | null): Promise<string | null> => {
  if (!image || !String(image).trim()) return null
  const raw = String(image).trim()
  if (raw.startsWith('data:image')) {
    try {
      return (await uploadBase64ToS3(raw, 'assets/item-request-declines')) || raw
    } catch {
      return raw
    }
  }
  return raw
}

export const enrichItemRequest = async (itemRequest: AssetItemRequest, scannerLocId?: string | null) => {
  const plain = itemRequest.toJSON() as AssetItemRequest & {
    assets?: EnrichedItemRequestAsset[]
    decidedByName?: string | null
    scanPhase?: ItemRequestScanPhase
  }
  const links = await loadJunctionRows(itemRequest.id)
  const ids = links.map((link) => link.assetId).filter(Boolean)

  const actorIds = [
    ...new Set(
      links.flatMap((link) => [link.outboundDecidedBy, link.returnDecidedBy]).filter((id): id is string => !!id),
    ),
  ]
  const nameById = new Map<string, string | null>()
  await Promise.all(
    actorIds.map(async (id) => {
      nameById.set(id, await resolveUserDisplayName(id))
    }),
  )

  const assets: EnrichedItemRequestAsset[] = links.map((link) => ({
    id: link.asset?.id || link.assetId,
    name: link.asset?.item?.name || '—',
    serialNumber: link.asset?.serialNumber ?? null,
    assetTag: link.asset?.assetTag ?? null,
    status: link.asset?.status ?? null,
    outboundStatus: link.outboundStatus,
    returnStatus: link.returnStatus,
    outboundDecidedByName: link.outboundDecidedBy ? (nameById.get(link.outboundDecidedBy) ?? null) : null,
    returnDecidedByName: link.returnDecidedBy ? (nameById.get(link.returnDecidedBy) ?? null) : null,
    outboundDecidedAt: toIsoOrNull(link.outboundDecidedAt),
    returnDecidedAt: toIsoOrNull(link.returnDecidedAt),
  }))

  const decidedStatuses: string[] = [
    ItemRequestStatus.APPROVED,
    ItemRequestStatus.DECLINED,
    ItemRequestStatus.RETURNED,
    ItemRequestStatus.RETURN_DECLINED,
  ]
  const isDecided = decidedStatuses.includes(plain.status)
  const decidedByName = isDecided ? await resolveUserDisplayName(plain.updatedBy) : null
  const scanPhase = resolveEffectiveScanPhase(itemRequest, scannerLocId)
  const scannerRole = scannerLocId ? resolveScannerRole(itemRequest, scannerLocId) : null
  const scannerCanAct =
    scanPhase === 'outbound'
      ? scannerRole === 'outbound'
      : scanPhase === 'return'
        ? scannerRole === 'inward' ||
          (itemRequest.reason !== ItemRequestReason.INTER_CENTER_TRANSFER && scannerRole === 'outbound')
        : false
  const { fromCenterName, toCenterName } = await loadLocationNamesForItemRequest(itemRequest)

  return {
    ...plain,
    assetIds: ids,
    assets,
    decidedByName,
    scanPhase,
    scannerRole,
    scannerCanAct,
    fromCenterName,
    toCenterName,
  }
}

export const resolveScannerRole = (
  itemRequest: AssetItemRequest,
  scannerLocId?: string | null,
): 'outbound' | 'inward' | null => {
  if (!scannerLocId) return null
  if (itemRequest.reason === ItemRequestReason.INTER_CENTER_TRANSFER) {
    if (scannerLocId === itemRequest.locId) return 'outbound'
    if (itemRequest.toLocId && scannerLocId === itemRequest.toLocId) return 'inward'
    return null
  }
  if (scannerLocId === itemRequest.locId) return 'outbound'
  return null
}

const assertScannerRole = (
  itemRequest: AssetItemRequest,
  scannerLocId: string | null | undefined,
  expected: 'outbound' | 'inward',
) => {
  if (itemRequest.reason === ItemRequestReason.INTER_CENTER_TRANSFER && !scannerLocId) {
    throw Object.assign(new Error('Scanner location is required for inter-center transfer gate actions'), {
      status: 400,
    })
  }
  if (!scannerLocId) return
  const role = resolveScannerRole(itemRequest, scannerLocId)
  if (role !== expected) {
    const msg =
      expected === 'outbound'
        ? 'Outbound approval must be performed at the originating center'
        : 'Inward approval must be performed at the destination center'
    throw Object.assign(new Error(msg), { status: 403 })
  }
}

export const findItemRequestByQr = async (qrCode: string, locId?: string | null) => {
  const code = String(qrCode).trim()
  if (!locId) {
    return AssetItemRequest.findOne({ where: { qrCode: code } })
  }
  return AssetItemRequest.findOne({
    where: {
      qrCode: code,
      [Op.or]: [{ locId }, { toLocId: locId, reason: ItemRequestReason.INTER_CENTER_TRANSFER }],
    },
  })
}

const isReturnEligible = (row: JunctionRow) => row.outboundStatus === ItemRequestAssetGateStatus.APPROVED

const pickPendingJunctionRows = (
  links: JunctionRow[],
  requestedAssetIds: string[],
  phase: 'outbound' | 'return',
): { rows: JunctionRow[]; error?: { message: string; status: number } } => {
  const statusField = phase === 'outbound' ? 'outboundStatus' : 'returnStatus'
  const eligibleLinks = phase === 'return' ? links.filter((row) => isReturnEligible(row)) : links
  const pending = eligibleLinks.filter((row) => row[statusField] === ItemRequestAssetGateStatus.PENDING)

  let selected: JunctionRow[]
  if (requestedAssetIds.length === 0) {
    selected = pending
  } else {
    const linkByAssetId = new Map(links.map((row) => [row.assetId, row]))
    const invalid = requestedAssetIds.find((id) => !linkByAssetId.has(id))
    if (invalid) {
      return { rows: [], error: { message: 'One or more assets are not on this gate pass', status: 400 } }
    }
    selected = requestedAssetIds
      .map((id) => linkByAssetId.get(id)!)
      .filter((row) => {
        if (row[statusField] !== ItemRequestAssetGateStatus.PENDING) return false
        if (phase === 'return' && !isReturnEligible(row)) return false
        return true
      })
  }

  if (selected.length === 0) {
    return {
      rows: [],
      error: {
        message:
          phase === 'return'
            ? 'No return-eligible pending assets selected for this gate action'
            : 'No pending assets selected for this gate action',
        status: 400,
      },
    }
  }

  return { rows: selected }
}

const rollupOutboundParentStatus = (
  links: JunctionRow[],
): ItemRequestStatus.PENDING | ItemRequestStatus.APPROVED | ItemRequestStatus.DECLINED => {
  const allDecided = links.every((row) => row.outboundStatus !== ItemRequestAssetGateStatus.PENDING)
  if (!allDecided) return ItemRequestStatus.PENDING

  const anyApproved = links.some((row) => row.outboundStatus === ItemRequestAssetGateStatus.APPROVED)
  return anyApproved ? ItemRequestStatus.APPROVED : ItemRequestStatus.DECLINED
}

const rollupReturnParentStatus = (
  links: JunctionRow[],
): ItemRequestStatus.APPROVED | ItemRequestStatus.RETURNED | ItemRequestStatus.RETURN_DECLINED => {
  // Outbound-declined assets never return — only outbound-approved links count for return rollup.
  const returnLinks = links.filter((row) => isReturnEligible(row))
  if (returnLinks.length === 0) return ItemRequestStatus.RETURN_DECLINED

  const allDecided = returnLinks.every((row) => row.returnStatus !== ItemRequestAssetGateStatus.PENDING)
  if (!allDecided) return ItemRequestStatus.APPROVED

  const approvedCount = returnLinks.filter((row) => row.returnStatus === ItemRequestAssetGateStatus.APPROVED).length
  const declinedCount = returnLinks.filter((row) => row.returnStatus === ItemRequestAssetGateStatus.DECLINED).length

  if (approvedCount > 0 && declinedCount === 0) return ItemRequestStatus.RETURNED
  if (declinedCount > 0 && approvedCount === 0) return ItemRequestStatus.RETURN_DECLINED
  if (approvedCount > 0) return ItemRequestStatus.RETURNED
  return ItemRequestStatus.RETURN_DECLINED
}

const approveOutbound = async (
  itemRequest: AssetItemRequest,
  updatedBy: string | null | undefined,
  requestedAssetIds: string[],
  scannerLocId?: string | null,
) => {
  assertScannerRole(itemRequest, scannerLocId, 'outbound')
  const actorId = updatedBy || null
  const isTransfer = itemRequest.reason === ItemRequestReason.INTER_CENTER_TRANSFER

  await sequelize.transaction(async (transaction) => {
    const links = (await AssetItemRequestAsset.findAll({
      where: { assetItemRequestId: itemRequest.id },
      transaction,
    })) as JunctionRow[]

    const { rows: targets, error } = pickPendingJunctionRows(links, requestedAssetIds, 'outbound')
    if (error) throw Object.assign(new Error(error.message), { status: error.status })

    for (const row of targets) {
      const decidedAt = new Date()
      await row.update(
        {
          outboundStatus: ItemRequestAssetGateStatus.APPROVED,
          outboundDecidedBy: actorId,
          outboundDecidedAt: decidedAt,
          updatedBy: actorId,
        },
        { transaction },
      )
      row.outboundStatus = ItemRequestAssetGateStatus.APPROVED
      row.outboundDecidedBy = actorId
      row.outboundDecidedAt = decidedAt

      if (isTransfer && itemRequest.toLocId) {
        const asset = await Asset.findByPk(row.assetId, { transaction })
        if (!asset) continue
        const fromStatus = asset.status
        const fromLocId = itemRequest.locId
        const toLocId = itemRequest.toLocId
        await asset.update(
          {
            locationId: toLocId,
            transferOriginLocationId: fromLocId,
            status: AssetStatus.INTER_CENTER_INCOMING,
            updatedBy: actorId,
          },
          { transaction },
        )
        await ensureMinimalCatalogLinksForTransfer(asset.id, toLocId, fromLocId, actorId, transaction)
        await AssetStatusLog.create(
          {
            assetId: asset.id,
            fromStatus,
            toStatus: AssetStatus.INTER_CENTER_INCOMING,
            note: 'Inter-center transfer outbound approved at gate',
            createdBy: actorId,
            updatedBy: actorId,
          },
          { transaction },
        )
      }
    }

    const refreshed = await AssetItemRequestAsset.findAll({
      where: { assetItemRequestId: itemRequest.id },
      transaction,
    })
    const nextStatus = rollupOutboundParentStatus(refreshed as JunctionRow[])

    if (nextStatus === ItemRequestStatus.APPROVED) {
      await itemRequest.update(
        {
          status: ItemRequestStatus.APPROVED,
          declineComment: null,
          declineImage: null,
          updatedBy: actorId,
        },
        { transaction },
      )
    } else if (nextStatus === ItemRequestStatus.DECLINED) {
      await itemRequest.update(
        {
          status: ItemRequestStatus.DECLINED,
          updatedBy: actorId,
        },
        { transaction },
      )
    } else {
      await itemRequest.update({ updatedBy: actorId }, { transaction })
    }
  })

  return { data: await enrichItemRequest(itemRequest, scannerLocId) }
}

const approveReturn = async (
  itemRequest: AssetItemRequest,
  updatedBy: string | null | undefined,
  requestedAssetIds: string[],
  scannerLocId?: string | null,
) => {
  if (itemRequest.reason === ItemRequestReason.SCRAP) {
    return { error: 'Return scan is not applicable for scrap gate passes' as const, status: 400 }
  }
  if (itemRequest.status !== ItemRequestStatus.APPROVED) {
    return {
      error: `Item request is already ${itemRequest.status}` as const,
      status: 400,
    }
  }

  if (itemRequest.reason === ItemRequestReason.INTER_CENTER_TRANSFER) {
    assertScannerRole(itemRequest, scannerLocId, 'inward')
  } else if (scannerLocId && scannerLocId !== itemRequest.locId) {
    throw Object.assign(new Error('Return approval must be performed at the issuing center'), { status: 403 })
  }

  const actorId = updatedBy || null
  const isTransfer = itemRequest.reason === ItemRequestReason.INTER_CENTER_TRANSFER

  await sequelize.transaction(async (transaction) => {
    const links = (await AssetItemRequestAsset.findAll({
      where: { assetItemRequestId: itemRequest.id },
      transaction,
    })) as JunctionRow[]

    const { rows: targets, error } = pickPendingJunctionRows(links, requestedAssetIds, 'return')
    if (error) throw Object.assign(new Error(error.message), { status: error.status })

    for (const row of targets) {
      const decidedAt = new Date()
      await row.update(
        {
          returnStatus: ItemRequestAssetGateStatus.APPROVED,
          returnDecidedBy: actorId,
          returnDecidedAt: decidedAt,
          updatedBy: actorId,
        },
        { transaction },
      )
      row.returnStatus = ItemRequestAssetGateStatus.APPROVED
      row.returnDecidedBy = actorId
      row.returnDecidedAt = decidedAt

      const asset = await Asset.findByPk(row.assetId, { transaction })
      if (!asset) continue
      const fromStatus = asset.status
      const toStatus = isTransfer ? AssetStatus.PENDING_TRANSFER_ACCEPTANCE : AssetStatus.PENDING_INSPECTION
      await asset.update(
        {
          status: toStatus,
          updatedBy: actorId,
        },
        { transaction },
      )
      await AssetStatusLog.create(
        {
          assetId: asset.id,
          fromStatus,
          toStatus,
          note: isTransfer ? 'Inter-center transfer inward approved at gate' : 'Return approved at gate',
          createdBy: actorId,
          updatedBy: actorId,
        },
        { transaction },
      )
    }

    const refreshed = await AssetItemRequestAsset.findAll({
      where: { assetItemRequestId: itemRequest.id },
      transaction,
    })
    const nextStatus = rollupReturnParentStatus(refreshed as JunctionRow[])

    if (nextStatus === ItemRequestStatus.RETURNED) {
      await itemRequest.update(
        {
          status: ItemRequestStatus.RETURNED,
          returnDeclineComment: null,
          returnDeclineImage: null,
          updatedBy: actorId,
        },
        { transaction },
      )
    } else if (nextStatus === ItemRequestStatus.RETURN_DECLINED) {
      await itemRequest.update({ status: ItemRequestStatus.RETURN_DECLINED, updatedBy: actorId }, { transaction })
    } else {
      await itemRequest.update({ updatedBy: actorId }, { transaction })
    }
  })

  return { data: await enrichItemRequest(itemRequest, scannerLocId) }
}

export const approveItemRequestById = async (
  itemRequestId: string,
  updatedBy?: string | null,
  assetIds?: string[] | unknown,
  scannerLocId?: string | null,
) => {
  const itemRequest = await AssetItemRequest.findByPk(itemRequestId)
  if (!itemRequest) {
    return { error: 'Item request not found' as const, status: 404 }
  }

  const requestedAssetIds = normalizeAssetIds(assetIds)

  try {
    if (itemRequest.status === ItemRequestStatus.PENDING) {
      return await approveOutbound(itemRequest, updatedBy, requestedAssetIds, scannerLocId)
    }

    if (itemRequest.status === ItemRequestStatus.APPROVED) {
      return await approveReturn(itemRequest, updatedBy, requestedAssetIds, scannerLocId)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to approve item request'
    const status = (err as { status?: number }).status || 400
    return { error: message, status }
  }

  return {
    error: `Item request is already ${itemRequest.status}` as const,
    status: 400,
  }
}

const declineOutbound = async (
  itemRequest: AssetItemRequest,
  trimmedComment: string,
  declineImage: string | null,
  updatedBy: string | null | undefined,
  requestedAssetIds: string[],
  scannerLocId?: string | null,
) => {
  assertScannerRole(itemRequest, scannerLocId, 'outbound')
  const actorId = updatedBy || null
  const isTransfer = itemRequest.reason === ItemRequestReason.INTER_CENTER_TRANSFER

  await sequelize.transaction(async (transaction) => {
    const links = (await AssetItemRequestAsset.findAll({
      where: { assetItemRequestId: itemRequest.id },
      transaction,
    })) as JunctionRow[]

    const { rows: targets, error } = pickPendingJunctionRows(links, requestedAssetIds, 'outbound')
    if (error) throw Object.assign(new Error(error.message), { status: error.status })

    for (const row of targets) {
      const decidedAt = new Date()
      await row.update(
        {
          outboundStatus: ItemRequestAssetGateStatus.DECLINED,
          outboundDecidedBy: actorId,
          outboundDecidedAt: decidedAt,
          updatedBy: actorId,
        },
        { transaction },
      )
      row.outboundStatus = ItemRequestAssetGateStatus.DECLINED
      row.outboundDecidedBy = actorId
      row.outboundDecidedAt = decidedAt

      const asset = await Asset.findByPk(row.assetId, { transaction })
      if (!asset) continue
      const fromStatus = asset.status
      const revertStatuses: AssetStatus[] = isTransfer
        ? [AssetStatus.INTER_CENTER_OUTBOUND_PENDING]
        : [AssetStatus.EXTERNAL_USE, AssetStatus.AVAILABLE]
      if (revertStatuses.includes(fromStatus as AssetStatus)) {
        await asset.update(
          {
            status: AssetStatus.AVAILABLE,
            updatedBy: actorId,
          },
          { transaction },
        )
        await AssetStatusLog.create(
          {
            assetId: asset.id,
            fromStatus,
            toStatus: AssetStatus.AVAILABLE,
            note: isTransfer ? 'Inter-center transfer outbound declined' : 'Outbound gate pass declined',
            createdBy: actorId,
            updatedBy: actorId,
          },
          { transaction },
        )
      }
    }

    const refreshed = await AssetItemRequestAsset.findAll({
      where: { assetItemRequestId: itemRequest.id },
      transaction,
    })
    const nextStatus = rollupOutboundParentStatus(refreshed as JunctionRow[])

    const parentPatch: Record<string, unknown> = {
      declineComment: trimmedComment,
      declineImage,
      updatedBy: actorId,
    }

    if (nextStatus === ItemRequestStatus.DECLINED) {
      parentPatch.status = ItemRequestStatus.DECLINED
    } else if (nextStatus === ItemRequestStatus.APPROVED) {
      parentPatch.status = ItemRequestStatus.APPROVED
      parentPatch.declineComment = null
      parentPatch.declineImage = null
    }

    await itemRequest.update(parentPatch, { transaction })
  })

  return { data: await enrichItemRequest(itemRequest, scannerLocId) }
}

const declineReturn = async (
  itemRequest: AssetItemRequest,
  trimmedComment: string,
  declineImage: string | null,
  updatedBy: string | null | undefined,
  requestedAssetIds: string[],
  scannerLocId?: string | null,
) => {
  if (itemRequest.reason === ItemRequestReason.SCRAP) {
    return { error: 'Return scan is not applicable for scrap gate passes' as const, status: 400 }
  }
  if (itemRequest.status !== ItemRequestStatus.APPROVED) {
    return {
      error: `Item request is already ${itemRequest.status}` as const,
      status: 400,
    }
  }

  if (itemRequest.reason === ItemRequestReason.INTER_CENTER_TRANSFER) {
    assertScannerRole(itemRequest, scannerLocId, 'inward')
  }

  const actorId = updatedBy || null

  await sequelize.transaction(async (transaction) => {
    const links = (await AssetItemRequestAsset.findAll({
      where: { assetItemRequestId: itemRequest.id },
      transaction,
    })) as JunctionRow[]

    const { rows: targets, error } = pickPendingJunctionRows(links, requestedAssetIds, 'return')
    if (error) throw Object.assign(new Error(error.message), { status: error.status })

    for (const row of targets) {
      const decidedAt = new Date()
      await row.update(
        {
          returnStatus: ItemRequestAssetGateStatus.DECLINED,
          returnDecidedBy: actorId,
          returnDecidedAt: decidedAt,
          updatedBy: actorId,
        },
        { transaction },
      )
      row.returnStatus = ItemRequestAssetGateStatus.DECLINED
      row.returnDecidedBy = actorId
      row.returnDecidedAt = decidedAt
    }

    const refreshed = await AssetItemRequestAsset.findAll({
      where: { assetItemRequestId: itemRequest.id },
      transaction,
    })
    const nextStatus = rollupReturnParentStatus(refreshed as JunctionRow[])

    const parentPatch: Record<string, unknown> = {
      returnDeclineComment: trimmedComment,
      returnDeclineImage: declineImage,
      updatedBy: actorId,
    }

    if (nextStatus === ItemRequestStatus.RETURNED) {
      parentPatch.status = ItemRequestStatus.RETURNED
    } else if (nextStatus === ItemRequestStatus.RETURN_DECLINED) {
      parentPatch.status = ItemRequestStatus.RETURN_DECLINED
    }

    await itemRequest.update(parentPatch, { transaction })
  })

  return { data: await enrichItemRequest(itemRequest, scannerLocId) }
}

export const declineItemRequestById = async (
  itemRequestId: string,
  comment: string,
  image?: string | null,
  updatedBy?: string | null,
  assetIds?: string[] | unknown,
  scannerLocId?: string | null,
) => {
  const trimmedComment = comment ? String(comment).trim() : ''
  if (!trimmedComment) {
    return { error: 'Decline comment is required' as const, status: 400 }
  }

  const itemRequest = await AssetItemRequest.findByPk(itemRequestId)
  if (!itemRequest) {
    return { error: 'Item request not found' as const, status: 404 }
  }

  const declineImage = await resolveDeclineImage(image)
  const requestedAssetIds = normalizeAssetIds(assetIds)

  try {
    if (itemRequest.status === ItemRequestStatus.PENDING) {
      return await declineOutbound(
        itemRequest,
        trimmedComment,
        declineImage,
        updatedBy,
        requestedAssetIds,
        scannerLocId,
      )
    }

    if (itemRequest.status === ItemRequestStatus.APPROVED) {
      return await declineReturn(itemRequest, trimmedComment, declineImage, updatedBy, requestedAssetIds, scannerLocId)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to decline item request'
    const status = (err as { status?: number }).status || 400
    return { error: message, status }
  }

  return {
    error: `Item request is already ${itemRequest.status}` as const,
    status: 400,
  }
}

/**
 * When an asset is marked available before L3 outbound approval:
 * - sole asset on a pending pass → mark pass cancelled (keep junction for history)
 * - multi-asset pass → remove this asset; roll up parent from remaining junctions
 */
export const cancelPendingOutboundGatePassesForAsset = async (
  assetId: string,
  actorId?: string | null,
  outerTransaction?: Transaction,
): Promise<{ cancelledRequestIds: string[] }> => {
  const run = async (transaction: Transaction) => {
    const cancelledRequestIds: string[] = []

    const links = (await AssetItemRequestAsset.findAll({
      where: {
        assetId,
        outboundStatus: ItemRequestAssetGateStatus.PENDING,
      },
      include: [
        {
          model: AssetItemRequest,
          as: 'itemRequest',
          required: true,
        },
      ],
      transaction,
    })) as Array<AssetItemRequestAsset & { itemRequest?: AssetItemRequest }>

    for (const link of links) {
      const request = link.itemRequest
      if (!request || request.status !== ItemRequestStatus.PENDING) continue

      const siblingCount = await AssetItemRequestAsset.count({
        where: { assetItemRequestId: request.id },
        transaction,
      })

      if (siblingCount <= 1) {
        await request.update({ status: ItemRequestStatus.CANCELLED, updatedBy: actorId || null }, { transaction })
        cancelledRequestIds.push(request.id)
        continue
      }

      await link.destroy({ transaction })

      const remaining = (await AssetItemRequestAsset.findAll({
        where: { assetItemRequestId: request.id },
        transaction,
      })) as JunctionRow[]

      if (remaining.length === 0) {
        await request.update({ status: ItemRequestStatus.CANCELLED, updatedBy: actorId || null }, { transaction })
        cancelledRequestIds.push(request.id)
        continue
      }

      const nextStatus = rollupOutboundParentStatus(remaining)
      if (nextStatus !== request.status) {
        await request.update({ status: nextStatus, updatedBy: actorId || null }, { transaction })
      }
    }

    return { cancelledRequestIds }
  }

  if (outerTransaction) {
    return run(outerTransaction)
  }
  return sequelize.transaction(run)
}
