import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface AssetVendorLocationAttributes extends BaseAttributes {
  vendorId: string
  locationId: string
}

export type AssetVendorLocationCreationAttributes = Optional<
  AssetVendorLocationAttributes,
  'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class AssetVendorLocation
  extends BaseModel<AssetVendorLocationAttributes, AssetVendorLocationCreationAttributes>
  implements AssetVendorLocationAttributes
{
  declare vendorId: string
  declare locationId: string
}

AssetVendorLocation.init(
  {
    ...baseModelColumns,
    vendorId: {
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
    tableName: 'asset_vendor_locations',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['vendorId', 'locationId'],
        name: 'asset_vendor_location_unique',
      },
    ],
  },
)

export default AssetVendorLocation
