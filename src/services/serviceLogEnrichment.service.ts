import { Asset, AssetItem, AssetServiceLog, AssetServiceLogAsset } from '../models/index.js'

export type EnrichedServiceLogAsset = {
  id: string
  name: string
  serialNumber?: string | null
  assetTag?: string | null
  status?: string | null
}

const loadLinkedAssets = async (serviceLogId: string) => {
  const rows = await AssetServiceLogAsset.findAll({
    where: { assetServiceLogId: serviceLogId },
    order: [['createdAt', 'ASC']],
    include: [
      {
        model: Asset,
        as: 'asset',
        attributes: ['id', 'serialNumber', 'assetTag', 'status', 'itemId'],
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
  })
  return rows
}

export const resolveServiceLogAssetIds = async (serviceLogId: string): Promise<string[]> => {
  const links = await AssetServiceLogAsset.findAll({
    where: { assetServiceLogId: serviceLogId },
    attributes: ['assetId'],
  })
  if (links.length > 0) {
    return links.map((row) => row.assetId).filter(Boolean)
  }
  const log = await AssetServiceLog.findByPk(serviceLogId, { attributes: ['assetId'] })
  return log?.assetId ? [log.assetId] : []
}

export const enrichServiceLog = async (serviceLog: AssetServiceLog) => {
  const plain = serviceLog.toJSON() as AssetServiceLog & {
    asset?: Asset & { item?: AssetItem }
    assets?: EnrichedServiceLogAsset[]
    assetIds?: string[]
    logAssets?: unknown[]
  }
  const links = await loadLinkedAssets(serviceLog.id)
  let assets: EnrichedServiceLogAsset[] = links.map((row) => {
    const link = row.toJSON() as { assetId: string; asset?: Asset & { item?: AssetItem } }
    const asset = link.asset
    return {
      id: asset?.id || link.assetId,
      name: asset?.item?.name || '—',
      serialNumber: asset?.serialNumber ?? null,
      assetTag: asset?.assetTag ?? null,
      status: asset?.status ?? null,
    }
  })

  if (assets.length === 0) {
    const primary = plain.asset as (Asset & { item?: AssetItem }) | undefined
    if (primary?.id || plain.assetId) {
      assets = [
        {
          id: primary?.id || plain.assetId,
          name: primary?.item?.name || '—',
          serialNumber: primary?.serialNumber ?? null,
          assetTag: primary?.assetTag ?? null,
          status: primary?.status ?? null,
        },
      ]
    }
  }

  const assetIds = assets.map((a) => a.id)

  const response = { ...plain, assets, assetIds }
  delete response.logAssets
  return response
}

export const enrichServiceLogs = async (logs: AssetServiceLog[]) => {
  return Promise.all(logs.map((log) => enrichServiceLog(log)))
}
