import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { ItemRequestReason, ItemRequestStatus, TransferSendCondition } from '../enums/asset.enum.js'
import type { AssetItemRequestAsset } from './assetItemRequestAsset.model.js'

export interface AssetItemRequestAttributes extends BaseAttributes {
  locId: string
  name: string
  phone: string
  reason: ItemRequestReason
  problem?: string | null
  qrCode?: string | null
  qrCodeImage?: string | null
  status: ItemRequestStatus
  requestImage?: string | null
  declineComment?: string | null
  declineImage?: string | null
  returnDeclineComment?: string | null
  returnDeclineImage?: string | null
  expectedReturnDate?: Date | string | null
  serviceLogId?: string | null
  toLocId?: string | null
  transferSendCondition?: TransferSendCondition | null
  transferReceiveCondition?: TransferSendCondition | null
  transferReceiveDescription?: string | null
  transferReceiveImage?: string | null
  transferRejectDescription?: string | null
  transferRejectImage?: string | null
}

export type AssetItemRequestCreationAttributes = Optional<
  AssetItemRequestAttributes,
  | 'id'
  | 'problem'
  | 'qrCode'
  | 'qrCodeImage'
  | 'status'
  | 'requestImage'
  | 'declineComment'
  | 'declineImage'
  | 'returnDeclineComment'
  | 'returnDeclineImage'
  | 'expectedReturnDate'
  | 'serviceLogId'
  | 'toLocId'
  | 'transferSendCondition'
  | 'transferReceiveCondition'
  | 'transferReceiveDescription'
  | 'transferReceiveImage'
  | 'transferRejectDescription'
  | 'transferRejectImage'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class AssetItemRequest
  extends BaseModel<AssetItemRequestAttributes, AssetItemRequestCreationAttributes>
  implements AssetItemRequestAttributes
{
  declare locId: string
  declare name: string
  declare phone: string
  declare reason: ItemRequestReason
  declare problem: string | null
  declare qrCode: string | null
  declare qrCodeImage: string | null
  declare status: ItemRequestStatus
  declare requestImage: string | null
  declare declineComment: string | null
  declare declineImage: string | null
  declare returnDeclineComment: string | null
  declare returnDeclineImage: string | null
  declare expectedReturnDate: Date | null
  declare serviceLogId: string | null
  declare toLocId: string | null
  declare transferSendCondition: TransferSendCondition | null
  declare transferReceiveCondition: TransferSendCondition | null
  declare transferReceiveDescription: string | null
  declare transferReceiveImage: string | null
  declare transferRejectDescription: string | null
  declare transferRejectImage: string | null
  declare requestAssets?: AssetItemRequestAsset[]
}

AssetItemRequest.init(
  {
    ...baseModelColumns,
    locId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    reason: {
      type: DataTypes.ENUM('scrap', 'repair', 'external_use', 'inter_center_transfer'),
      allowNull: false,
    },
    problem: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    qrCode: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    qrCodeImage: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'declined', 'returned', 'return_declined', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending',
    },
    requestImage: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
    declineComment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    declineImage: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
    returnDeclineComment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    returnDeclineImage: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
    expectedReturnDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    serviceLogId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    toLocId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    transferSendCondition: {
      type: DataTypes.ENUM('new', 'good', 'bad', 'partially_damage'),
      allowNull: true,
    },
    transferReceiveCondition: {
      type: DataTypes.ENUM('new', 'good', 'bad', 'partially_damage'),
      allowNull: true,
    },
    transferReceiveDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    transferReceiveImage: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
    transferRejectDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    transferRejectImage: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'asset_item_requests',
    timestamps: true,
  },
)

export default AssetItemRequest
