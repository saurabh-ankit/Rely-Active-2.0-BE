import { DataTypes, type Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseModel, baseModelColumns, type BaseAttributes } from './base.model.js'
export interface InventoryVendorLocationAttributes extends BaseAttributes {
  vendorId: string
  locationId: string
}
export type InventoryVendorLocationCreationAttributes = Optional<
  InventoryVendorLocationAttributes,
  'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>
export class InventoryVendorLocation
  extends BaseModel<InventoryVendorLocationAttributes, InventoryVendorLocationCreationAttributes>
  implements InventoryVendorLocationAttributes
{
  declare vendorId: string
  declare locationId: string
}
InventoryVendorLocation.init(
  {
    ...baseModelColumns,
    vendorId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inventory_vendors', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'properties', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
  },
  {
    sequelize,
    tableName: 'inventory_vendor_locations',
    timestamps: true,
    indexes: [{ unique: true, fields: ['vendorId', 'locationId'] }],
  },
)
