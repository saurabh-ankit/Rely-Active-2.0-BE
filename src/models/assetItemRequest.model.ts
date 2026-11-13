import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { ItemRequestReason, ItemRequestStatus } from '../enums/asset.enum.js'

export interface AssetItemRequestAttributes extends BaseAttributes {
  locId: string
  name: string
  phone: string
  assetIds: string[]
  reason: ItemRequestReason
  problem?: string | null
  qrCode?: string | null
  qrCodeImage?: string | null
  status: ItemRequestStatus
  requestImage?: string | null
  declineComment?: string | null
  declineImage?: string | null
  expectedReturnDate?: Date | string | null
  serviceLogId?: string | null
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
  | 'expectedReturnDate'
  | 'serviceLogId'
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
  declare assetIds: string[]
  declare reason: ItemRequestReason
  declare problem: string | null
  declare qrCode: string | null
  declare qrCodeImage: string | null
  declare status: ItemRequestStatus
  declare requestImage: string | null
  declare declineComment: string | null
  declare declineImage: string | null
  declare expectedReturnDate: Date | null
  declare serviceLogId: string | null
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
    assetIds: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    reason: {
      type: DataTypes.ENUM('scrap', 'repair', 'external_use'),
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
      type: DataTypes.ENUM('pending', 'approved', 'declined'),
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
    expectedReturnDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    serviceLogId: {
      type: DataTypes.UUID,
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
