import type { Transaction } from 'sequelize'
import { Op, QueryTypes } from 'sequelize'
import sequelize from '../config/db/index.js'
import {
  Asset,
  AssetCategory,
  AssetCategoryLocation,
  AssetItem,
  AssetItemLocation,
  AssetItemRequest,
  AssetItemRequestAsset,
  AssetStatusLog,
  Property,
} from '../models/index.js'
import { AssetStatus, ItemRequestReason, ItemRequestStatus, TransferSendCondition } from '../enums/asset.enum.js'
import { uploadBase64ToS3 } from '../middlewares/s3/index.js'

const TRANSFER_SEND_CONDITIONS = new Set<string>(Object.values(TransferSendCondition))

const ACTIVE_TRANSFER_ASSET_STATUSES = [
  AssetStatus.INTER_CENTER_OUTBOUND_PENDING,
  AssetStatus.INTER_CENTER_INCOMING,
  AssetStatus.PENDING_TRANSFER_ACCEPTANCE,
  AssetStatus.TRANSFER_REJECTED,
]

/** Assets that left this center after inward gate complete (origin registry; any status at destination). */
export const findSuccessfullyTransferredAssetIdsForOriginCenter = async (locationId: string): Promise<string[]> => {
  const rows = (await sequelize.query(
    `
    SELECT DISTINCT ra.assetId AS assetId
    FROM asset_item_request_assets ra
    INNER JOIN asset_item_requests r ON r.id = ra.assetItemRequestId
    INNER JOIN assets a ON a.id = ra.assetId
    WHERE r.locId = :locationId
      AND r.reason = :reason
      AND r.status = :returnedStatus
      AND a.locationId <> :locationId
    `,
    {
      replacements: {
        locationId,
        reason: ItemRequestReason.INTER_CENTER_TRANSFER,
        returnedStatus: ItemRequestStatus.RETURNED,
      },
      type: QueryTypes.SELECT,
    },
  )) as { assetId: string }[]
  return [...new Set(rows.map((r) => r.assetId).filter(Boolean))]
}

/** Sequelize \`where\` OR branches for assets visible in a center table (incl. transferred-out registry). */
export const buildOriginCenterAssetLocationOr = async (locationId: string): Promise<Record<string, unknown>[]> => {
  const [inFlightIds, completedTransferIds] = await Promise.all([
    findInterCenterAssetIdsForOriginCenter(locationId),
    findSuccessfullyTransferredAssetIdsForOriginCenter(locationId),
  ])

  const locationOr: Record<string, unknown>[] = [
    { locationId },
    {
      transferOriginLocationId: locationId,
      locationId: { [Op.ne]: locationId },
    },
  ]
  const extraIds = [...new Set([...inFlightIds, ...completedTransferIds])]
  if (extraIds.length > 0) {
    locationOr.push({ id: { [Op.in]: extraIds } })
  }
  return locationOr
}

/** Only assets transferred out from this center (origin registry rows). */
export const buildTransferredOutAssetLocationOr = async (locationId: string): Promise<Record<string, unknown>[]> => {
  const completedTransferIds = await findSuccessfullyTransferredAssetIdsForOriginCenter(locationId)
  const locationOr: Record<string, unknown>[] = [
    {
      transferOriginLocationId: locationId,
      locationId: { [Op.ne]: locationId },
    },
  ]
  if (completedTransferIds.length > 0) {
    locationOr.push({ id: { [Op.in]: completedTransferIds } })
  }
  return locationOr
}

export const ACTIVE_TRANSFER_FLOW_STATUSES = ACTIVE_TRANSFER_ASSET_STATUSES

/** Asset IDs on inter-center gate passes from this center (keeps origin list in sync with Gate Pass tab). */
export const findInterCenterAssetIdsForOriginCenter = async (locationId: string): Promise<string[]> => {
  const rows = (await sequelize.query(
    `
    SELECT DISTINCT ra.assetId AS assetId
    FROM asset_item_request_assets ra
    INNER JOIN asset_item_requests r ON r.id = ra.assetItemRequestId
    INNER JOIN assets a ON a.id = ra.assetId
    WHERE r.locId = :locationId
      AND r.reason = :reason
      AND a.status IN (:activeTransferStatuses)
    `,
    {
      replacements: {
        locationId,
        reason: ItemRequestReason.INTER_CENTER_TRANSFER,
        activeTransferStatuses: ACTIVE_TRANSFER_ASSET_STATUSES,
      },
      type: QueryTypes.SELECT,
    },
  )) as { assetId: string }[]
  return [...new Set(rows.map((r) => r.assetId).filter(Boolean))]
}

export const resolveTransferImage = async (image?: string | null): Promise<string | null> => {
  if (!image || !String(image).trim()) return null
  const raw = String(image).trim()
  if (raw.startsWith('data:image')) {
    try {
      return (await uploadBase64ToS3(raw, 'assets/transfer-images')) || raw
    } catch {
      return raw
    }
  }
  return raw
}

/** Ensure category + item catalog links exist at the destination center. */
export const ensureCatalogAtLocation = async (
  asset: Asset,
  locationId: string,
  actorId: string | null,
  transaction: Transaction,
): Promise<void> => {
  const item = await AssetItem.findByPk(asset.itemId, {
    include: [{ model: AssetCategory, as: 'category', attributes: ['id', 'name'] }],
    transaction,
  })
  if (!item) return

  const categoryId = item.categoryId
  const existingCatLoc = await AssetCategoryLocation.findOne({
    where: { categoryId, locationId },
    transaction,
  })
  if (!existingCatLoc) {
    await AssetCategoryLocation.create(
      {
        categoryId,
        locationId,
        createdBy: actorId,
      },
      { transaction },
    )
  }

  const existingItemLoc = await AssetItemLocation.findOne({
    where: { itemId: asset.itemId, locationId },
    transaction,
  })
  if (!existingItemLoc) {
    await AssetItemLocation.create(
      {
        itemId: asset.itemId,
        locationId,
        createdBy: actorId,
      },
      { transaction },
    )
  }
}

export const ensureMinimalCatalogLinksForTransfer = async (
  assetId: string,
  toLocId: string,
  fromLocId: string,
  actorId: string | null,
  transaction: Transaction,
): Promise<void> => {
  const asset = await Asset.findByPk(assetId, { transaction })
  if (!asset) return
  await ensureCatalogAtLocation(asset, toLocId, actorId, transaction)
}

export const findOpenInterCenterRequestForAsset = async (assetId: string): Promise<AssetItemRequest | null> => {
  const links = await AssetItemRequestAsset.findAll({
    where: { assetId },
    order: [['createdAt', 'DESC']],
  })
  for (const link of links) {
    const itemRequest = await AssetItemRequest.findByPk(link.assetItemRequestId)
    if (
      itemRequest &&
      itemRequest.reason === ItemRequestReason.INTER_CENTER_TRANSFER &&
      [ItemRequestStatus.PENDING, ItemRequestStatus.APPROVED, ItemRequestStatus.RETURNED].includes(
        itemRequest.status as ItemRequestStatus,
      )
    ) {
      return itemRequest
    }
  }
  return null
}

const loadTransferOriginNames = async (originIds: string[]): Promise<Map<string, string>> => {
  const unique = [...new Set(originIds.filter(Boolean))]
  if (unique.length === 0) return new Map()
  const props = await Property.findAll({
    where: { id: { [Op.in]: unique } },
    attributes: ['id', 'property_name'],
  })
  return new Map(props.map((p) => [p.id, p.property_name]))
}

const ACTIVE_TRANSFER_STATUSES = new Set<string>(ACTIVE_TRANSFER_ASSET_STATUSES)

export const enrichAssetsWithTransferFromName = async (
  assets: Array<Record<string, unknown>>,
  viewerLocationId?: string | null,
): Promise<Array<Record<string, unknown>>> => {
  const viewerId = viewerLocationId && viewerLocationId !== 'all' ? String(viewerLocationId) : null

  const needsOriginName = assets.filter(
    (a) =>
      a.transferOriginLocationId &&
      (a.status === AssetStatus.INTER_CENTER_INCOMING || a.status === AssetStatus.PENDING_TRANSFER_ACCEPTANCE),
  )
  const originNameById = await loadTransferOriginNames(needsOriginName.map((a) => String(a.transferOriginLocationId)))

  const completedAtOriginIds = viewerId
    ? new Set(await findSuccessfullyTransferredAssetIdsForOriginCenter(viewerId))
    : new Set<string>()

  const destIds = assets
    .filter((a) => {
      const originId = a.transferOriginLocationId ? String(a.transferOriginLocationId) : null
      const destId = a.locationId ? String(a.locationId) : null
      const assetId = a.id ? String(a.id) : ''
      if (!destId || !viewerId || destId === viewerId) return false
      return originId === viewerId || completedAtOriginIds.has(assetId)
    })
    .map((a) => String(a.locationId))
  const destNameById = await loadTransferOriginNames(destIds)
  const destNameByAssetId = new Map<string, string>()

  const junctionOnPage = [...completedAtOriginIds].filter((id) => assets.some((a) => String(a.id) === id))
  if (junctionOnPage.length > 0 && viewerId) {
    const rows = (await sequelize.query(
      `
      SELECT ra.assetId AS assetId, r.toLocId AS destLocId
      FROM asset_item_request_assets ra
      INNER JOIN asset_item_requests r ON r.id = ra.assetItemRequestId
      WHERE ra.assetId IN (:assetIds)
        AND r.reason = :reason
        AND r.status = :returnedStatus
        AND r.locId = :viewerId
      ORDER BY r.createdAt DESC
      `,
      {
        replacements: {
          assetIds: junctionOnPage,
          reason: ItemRequestReason.INTER_CENTER_TRANSFER,
          returnedStatus: ItemRequestStatus.RETURNED,
          viewerId,
        },
        type: QueryTypes.SELECT,
      },
    )) as { assetId: string; destLocId: string }[]
    const destLocByAssetId = new Map<string, string>()
    for (const row of rows) {
      if (!destLocByAssetId.has(row.assetId)) destLocByAssetId.set(row.assetId, row.destLocId)
    }
    const passDestNames = await loadTransferOriginNames([...new Set(rows.map((r) => r.destLocId).filter(Boolean))])
    for (const [assetId, destLocId] of destLocByAssetId) {
      const name = passDestNames.get(destLocId)
      if (name) destNameByAssetId.set(assetId, name)
    }
  }

  return assets.map((a) => {
    const assetId = a.id ? String(a.id) : ''
    const originId = a.transferOriginLocationId ? String(a.transferOriginLocationId) : viewerId
    const destId = a.locationId ? String(a.locationId) : null
    const locationJoin = a.location as { property_name?: string } | undefined
    const transferFromCenterName = originId && originNameById.has(originId) ? originNameById.get(originId) : undefined
    let transferToCenterName =
      destId && destNameById.has(destId) ? destNameById.get(destId) : locationJoin?.property_name || undefined

    if (destNameByAssetId.has(assetId)) {
      transferToCenterName = destNameByAssetId.get(assetId)
    }

    const patch: Record<string, unknown> = { ...a }
    if (transferFromCenterName) patch.transferFromCenterName = transferFromCenterName
    const status = String(a.status)
    const linkedToViewerOrigin =
      viewerId &&
      (String(a.transferOriginLocationId) === viewerId ||
        String(originId) === viewerId ||
        completedAtOriginIds.has(assetId))
    const recordedAsTransferred = Boolean(
      viewerId && destId && destId !== viewerId && linkedToViewerOrigin && !ACTIVE_TRANSFER_STATUSES.has(status),
    )
    if (originId && destId && originId !== destId && transferToCenterName) {
      if (ACTIVE_TRANSFER_STATUSES.has(status) || recordedAsTransferred) {
        patch.transferToCenterName = transferToCenterName
      }
    }
    if (recordedAsTransferred) {
      patch.showAtOriginAsTransferred = true
      if (!a.transferOriginLocationId) {
        patch.transferOriginLocationId = viewerId
      }
    }
    return patch
  })
}

export const acceptAssetTransfer = async (params: {
  assetId: string
  locationId: string
  receiveCondition: string
  description?: string
  image?: string | null
  availability: 'available' | 'not_available'
  actorId: string | null
}) => {
  const { assetId, locationId, receiveCondition, description, image, availability, actorId } = params

  if (!TRANSFER_SEND_CONDITIONS.has(receiveCondition)) {
    return { error: 'Invalid receive condition' as const, status: 400 }
  }

  const asset = await Asset.findByPk(assetId)
  if (!asset) return { error: 'Asset not found' as const, status: 404 }
  if (asset.locationId !== locationId) {
    return { error: 'Asset does not belong to this center' as const, status: 400 }
  }
  if (asset.status !== AssetStatus.PENDING_TRANSFER_ACCEPTANCE) {
    return {
      error: `Asset is not pending transfer acceptance. Current status: ${asset.status}` as const,
      status: 400,
    }
  }

  const itemRequest = await findOpenInterCenterRequestForAsset(assetId)
  if (!itemRequest || itemRequest.status !== ItemRequestStatus.RETURNED) {
    return { error: 'No completed inward transfer gate pass found for this asset' as const, status: 400 }
  }

  const receiveImage = await resolveTransferImage(image)
  const nextStatus = availability === 'available' ? AssetStatus.AVAILABLE : AssetStatus.MAINTENANCE

  await sequelize.transaction(async (transaction) => {
    if (availability === 'available') {
      await ensureCatalogAtLocation(asset, locationId, actorId, transaction)
    }

    const fromStatus = asset.status
    const originLocId = asset.transferOriginLocationId || itemRequest.locId
    await asset.update(
      {
        status: nextStatus,
        transferOriginLocationId: originLocId,
        updatedBy: actorId,
      },
      { transaction },
    )

    await AssetStatusLog.create(
      {
        assetId: asset.id,
        fromStatus,
        toStatus: nextStatus,
        note:
          availability === 'available'
            ? 'Inter-center transfer accepted — marked available'
            : 'Inter-center transfer accepted — marked not available (maintenance)',
        createdBy: actorId,
        updatedBy: actorId,
      },
      { transaction },
    )

    await itemRequest.update(
      {
        transferReceiveCondition: receiveCondition as TransferSendCondition,
        transferReceiveDescription: description?.trim() || null,
        transferReceiveImage: receiveImage,
        updatedBy: actorId,
      },
      { transaction },
    )
  })

  const refreshed = await Asset.findByPk(assetId, {
    include: [
      {
        model: AssetItem,
        as: 'item',
        attributes: ['id', 'name'],
      },
    ],
  })
  return { data: refreshed }
}

export const rejectAssetTransfer = async (params: {
  assetId: string
  locationId: string
  description: string
  image?: string | null
  actorId: string | null
}) => {
  const { assetId, locationId, description, image, actorId } = params
  const trimmed = description?.trim()
  if (!trimmed) return { error: 'Description is required' as const, status: 400 }

  const asset = await Asset.findByPk(assetId)
  if (!asset) return { error: 'Asset not found' as const, status: 404 }
  if (asset.locationId !== locationId) {
    return { error: 'Asset does not belong to this center' as const, status: 400 }
  }
  if (asset.status !== AssetStatus.PENDING_TRANSFER_ACCEPTANCE) {
    return {
      error: `Asset is not pending transfer acceptance. Current status: ${asset.status}` as const,
      status: 400,
    }
  }

  const itemRequest = await findOpenInterCenterRequestForAsset(assetId)
  if (!itemRequest) {
    return { error: 'No transfer gate pass found for this asset' as const, status: 400 }
  }

  const rejectImage = await resolveTransferImage(image)

  await sequelize.transaction(async (transaction) => {
    const fromStatus = asset.status
    await asset.update(
      {
        status: AssetStatus.TRANSFER_REJECTED,
        updatedBy: actorId,
      },
      { transaction },
    )

    await AssetStatusLog.create(
      {
        assetId: asset.id,
        fromStatus,
        toStatus: AssetStatus.TRANSFER_REJECTED,
        note: 'Inter-center transfer rejected at destination',
        createdBy: actorId,
        updatedBy: actorId,
      },
      { transaction },
    )

    await itemRequest.update(
      {
        transferRejectDescription: trimmed,
        transferRejectImage: rejectImage,
        updatedBy: actorId,
      },
      { transaction },
    )
  })

  const refreshed = await Asset.findByPk(assetId)
  return { data: refreshed }
}

export const loadLocationNamesForItemRequest = async (itemRequest: AssetItemRequest) => {
  const ids = [itemRequest.locId, itemRequest.toLocId].filter(Boolean) as string[]
  const map = await loadTransferOriginNames(ids)
  return {
    fromCenterName: map.get(itemRequest.locId) ?? null,
    toCenterName: itemRequest.toLocId ? (map.get(itemRequest.toLocId) ?? null) : null,
  }
}
