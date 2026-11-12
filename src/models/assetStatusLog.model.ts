import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface AssetStatusLogAttributes extends BaseAttributes {
  assetId: string
  fromStatus: string
  toStatus: string
  note?: string | null
}

export type AssetStatusLogCreationAttributes = Optional<
  AssetStatusLogAttributes,
  'id' | 'note' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class AssetStatusLog
  extends BaseModel<AssetStatusLogAttributes, AssetStatusLogCreationAttributes>
  implements AssetStatusLogAttributes
{
  declare assetId: string
  declare fromStatus: string
  declare toStatus: string
  declare note: string | null
}

AssetStatusLog.init(
  {
    ...baseModelColumns,
    assetId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    fromStatus: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    toStatus: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'asset_status_logs',
    timestamps: true,
  },
)

export default AssetStatusLog
