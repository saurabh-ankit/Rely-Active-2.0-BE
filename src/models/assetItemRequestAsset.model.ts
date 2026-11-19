import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { ItemRequestAssetGateStatus } from '../enums/asset.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { AssetItemRequest } from './assetItemRequest.model.js'
import type { Asset } from './asset.model.js'

/** One asset linked to a gate pass. A pass has many of these rows. */
export interface AssetItemRequestAssetAttributes extends BaseAttributes {
  assetItemRequestId: string
  assetId: string
  outboundStatus: ItemRequestAssetGateStatus
  returnStatus: ItemRequestAssetGateStatus
  outboundDecidedBy?: string | null
  returnDecidedBy?: string | null
  outboundDecidedAt?: Date | string | null
  returnDecidedAt?: Date | string | null
}

export type AssetItemRequestAssetCreationAttributes = Optional<
  AssetItemRequestAssetAttributes,
  | 'id'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
  | 'outboundStatus'
  | 'returnStatus'
  | 'outboundDecidedBy'
  | 'returnDecidedBy'
  | 'outboundDecidedAt'
  | 'returnDecidedAt'
>

export class AssetItemRequestAsset
  extends BaseModel<AssetItemRequestAssetAttributes, AssetItemRequestAssetCreationAttributes>
  implements AssetItemRequestAssetAttributes
{
  declare assetItemRequestId: string
  declare assetId: string
  declare outboundStatus: ItemRequestAssetGateStatus
  declare returnStatus: ItemRequestAssetGateStatus
  declare outboundDecidedBy: string | null
  declare returnDecidedBy: string | null
  declare outboundDecidedAt: Date | null
  declare returnDecidedAt: Date | null
  declare itemRequest?: AssetItemRequest
  declare asset?: Asset
}

AssetItemRequestAsset.init(
  {
    ...baseModelColumns,
    assetItemRequestId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'asset_item_requests', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    assetId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'assets', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    },
    outboundStatus: {
      type: DataTypes.ENUM(...Object.values(ItemRequestAssetGateStatus)),
      allowNull: false,
      defaultValue: ItemRequestAssetGateStatus.PENDING,
    },
    returnStatus: {
      type: DataTypes.ENUM(...Object.values(ItemRequestAssetGateStatus)),
      allowNull: false,
      defaultValue: ItemRequestAssetGateStatus.PENDING,
    },
    outboundDecidedBy: {
      type: DataTypes.CHAR(36),
      allowNull: true,
    },
    returnDecidedBy: {
      type: DataTypes.CHAR(36),
      allowNull: true,
    },
    outboundDecidedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    returnDecidedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'asset_item_request_assets',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['assetItemRequestId', 'assetId'],
        name: 'asset_item_request_assets_request_asset_unique',
      },
      {
        fields: ['assetId'],
        name: 'asset_item_request_assets_asset_id_idx',
      },
    ],
  },
)

export default AssetItemRequestAsset
