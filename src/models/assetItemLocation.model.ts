import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface AssetItemLocationAttributes extends BaseAttributes {
  itemId: string
  locationId: string
}

export type AssetItemLocationCreationAttributes = Optional<
  AssetItemLocationAttributes,
  'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class AssetItemLocation
  extends BaseModel<AssetItemLocationAttributes, AssetItemLocationCreationAttributes>
  implements AssetItemLocationAttributes
{
  declare itemId: string
  declare locationId: string
}

AssetItemLocation.init(
  {
    ...baseModelColumns,
    itemId: {
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
    tableName: 'asset_item_locations',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['itemId', 'locationId'],
        name: 'asset_item_location_unique',
      },
    ],
  },
)

export default AssetItemLocation
