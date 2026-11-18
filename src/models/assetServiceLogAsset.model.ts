import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

/** One asset linked to a service log (repair/scrap batch). */
export interface AssetServiceLogAssetAttributes extends BaseAttributes {
  assetServiceLogId: string
  assetId: string
}

export type AssetServiceLogAssetCreationAttributes = Optional<
  AssetServiceLogAssetAttributes,
  'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class AssetServiceLogAsset
  extends BaseModel<AssetServiceLogAssetAttributes, AssetServiceLogAssetCreationAttributes>
  implements AssetServiceLogAssetAttributes
{
  declare assetServiceLogId: string
  declare assetId: string
}

AssetServiceLogAsset.init(
  {
    ...baseModelColumns,
    assetServiceLogId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'asset_service_logs', key: 'id' },
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
  },
  {
    sequelize,
    tableName: 'asset_service_log_assets',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['assetServiceLogId', 'assetId'],
        name: 'asset_service_log_assets_log_asset_unique',
      },
      {
        fields: ['assetId'],
        name: 'asset_service_log_assets_asset_id_idx',
      },
    ],
  },
)

export default AssetServiceLogAsset
