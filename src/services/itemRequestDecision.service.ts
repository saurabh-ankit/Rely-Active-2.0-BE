import { Asset, AssetItem, AssetItemRequest, User, UserDetail } from '../models/index.js'
import { ItemRequestStatus } from '../enums/asset.enum.js'
import { uploadBase64ToS3 } from '../middlewares/s3/index.js'

export type EnrichedItemRequestAsset = {
  id: string
  name: string
  serialNumber?: string | null
  assetTag?: string | null
}

const resolveAssetIds = (raw: unknown): string[] => {
  if (Array.isArray(raw)) {
    return raw.map(String).filter(Boolean)
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
    } catch {
      return raw ? [raw] : []
    }
  }
  return []
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

export const enrichItemRequest = async (itemRequest: AssetItemRequest) => {
  const plain = itemRequest.toJSON() as AssetItemRequest & {
    assets?: EnrichedItemRequestAsset[]
    decidedByName?: string | null
  }
  const ids = resolveAssetIds(plain.assetIds)
  let assets: EnrichedItemRequestAsset[] = []

  if (ids.length > 0) {
    const rows = await Asset.findAll({
      where: { id: ids },
      attributes: ['id', 'serialNumber', 'assetTag', 'itemId'],
      include: [
        {
          model: AssetItem,
          as: 'item',
          attributes: ['id', 'name'],
          required: false,
        },
      ],
    })

    assets = rows.map((row) => {
      const data = row.toJSON() as {
        id: string
        serialNumber?: string | null
        assetTag?: string | null
        item?: { id: string; name: string } | null
      }
      return {
        id: data.id,
        name: data.item?.name || '—',
        serialNumber: data.serialNumber ?? null,
        assetTag: data.assetTag ?? null,
      }
    })
  }

  const isDecided = plain.status === ItemRequestStatus.APPROVED || plain.status === ItemRequestStatus.DECLINED
  const decidedByName = isDecided ? await resolveUserDisplayName(plain.updatedBy) : null

  return { ...plain, assetIds: ids, assets, decidedByName }
}

export const findItemRequestByQr = async (qrCode: string, locId?: string | null) => {
  const where: { qrCode: string; locId?: string } = { qrCode: String(qrCode).trim() }
  if (locId) {
    where.locId = locId
  }
  return AssetItemRequest.findOne({ where })
}

export const approveItemRequestById = async (itemRequestId: string, updatedBy?: string | null) => {
  const itemRequest = await AssetItemRequest.findByPk(itemRequestId)
  if (!itemRequest) {
    return { error: 'Item request not found' as const, status: 404 }
  }
  if (itemRequest.status !== ItemRequestStatus.PENDING) {
    return {
      error: `Item request is already ${itemRequest.status}` as const,
      status: 400,
    }
  }

  await itemRequest.update({
    status: ItemRequestStatus.APPROVED,
    declineComment: null,
    declineImage: null,
    updatedBy: updatedBy || null,
  })

  return { data: await enrichItemRequest(itemRequest) }
}

export const declineItemRequestById = async (
  itemRequestId: string,
  comment: string,
  image?: string | null,
  updatedBy?: string | null,
) => {
  const trimmedComment = comment ? String(comment).trim() : ''
  if (!trimmedComment) {
    return { error: 'Decline comment is required' as const, status: 400 }
  }

  const itemRequest = await AssetItemRequest.findByPk(itemRequestId)
  if (!itemRequest) {
    return { error: 'Item request not found' as const, status: 404 }
  }
  if (itemRequest.status !== ItemRequestStatus.PENDING) {
    return {
      error: `Item request is already ${itemRequest.status}` as const,
      status: 400,
    }
  }

  let declineImage: string | null = null
  if (image && String(image).trim()) {
    const raw = String(image).trim()
    if (raw.startsWith('data:image')) {
      try {
        declineImage = (await uploadBase64ToS3(raw, 'assets/item-request-declines')) || raw
      } catch {
        declineImage = raw
      }
    } else {
      declineImage = raw
    }
  }

  await itemRequest.update({
    status: ItemRequestStatus.DECLINED,
    declineComment: trimmedComment,
    declineImage,
    updatedBy: updatedBy || null,
  })

  return { data: await enrichItemRequest(itemRequest) }
}
