import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface AssetCategoryLocationAttributes extends BaseAttributes {
  categoryId: string
  locationId: string
}

export type AssetCategoryLocationCreationAttributes = Optional<
  AssetCategoryLocationAttributes,
  'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class AssetCategoryLocation
  extends BaseModel<AssetCategoryLocationAttributes, AssetCategoryLocationCreationAttributes>
  implements AssetCategoryLocationAttributes
{
  declare categoryId: string
  declare locationId: string
}

AssetCategoryLocation.init(
  {
    ...baseModelColumns,
    categoryId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'asset_category_locations',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['categoryId', 'locationId'],
        name: 'asset_category_location_unique',
      },
    ],
  },
)

export default AssetCategoryLocation
