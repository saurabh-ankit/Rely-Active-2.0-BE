import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface AssetItemAttributes extends BaseAttributes {
  name: string
  description?: string | null
  categoryId: string
  vendorId?: string | null
  model?: string | null
  manufacturer?: string | null
  specifications?: Record<string, unknown> | null
}

export type AssetItemCreationAttributes = Optional<
  AssetItemAttributes,
  | 'id'
  | 'description'
  | 'vendorId'
  | 'model'
  | 'manufacturer'
  | 'specifications'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class AssetItem
  extends BaseModel<AssetItemAttributes, AssetItemCreationAttributes>
  implements AssetItemAttributes
{
  declare name: string
  declare description: string | null
  declare categoryId: string
  declare vendorId: string | null
  declare model: string | null
  declare manufacturer: string | null
  declare specifications: Record<string, unknown> | null
}

AssetItem.init(
  {
    ...baseModelColumns,
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    categoryId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    vendorId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    model: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    manufacturer: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    specifications: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'asset_items',
    timestamps: true,
  },
)

export default AssetItem
