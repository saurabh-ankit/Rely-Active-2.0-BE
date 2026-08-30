import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface AssetCategoryAttributes extends BaseAttributes {
  name: string
  description?: string | null
}

export type AssetCategoryCreationAttributes = Optional<
  AssetCategoryAttributes,
  'id' | 'description' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class AssetCategory
  extends BaseModel<AssetCategoryAttributes, AssetCategoryCreationAttributes>
  implements AssetCategoryAttributes
{
  declare name: string
  declare description: string | null
}

AssetCategory.init(
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
  },
  {
    sequelize,
    tableName: 'asset_categories',
    timestamps: true,
  },
)

export default AssetCategory
