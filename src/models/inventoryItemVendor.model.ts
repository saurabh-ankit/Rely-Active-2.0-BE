import { DataTypes, type Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseModel, baseModelColumns, type BaseAttributes } from './base.model.js'
export interface InventoryItemVendorAttributes extends BaseAttributes {
  itemId: string
  vendorId: string
  locationId: string
}
export type InventoryItemVendorCreationAttributes = Optional<
  InventoryItemVendorAttributes,
  'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>
export class InventoryItemVendor
  extends BaseModel<InventoryItemVendorAttributes, InventoryItemVendorCreationAttributes>
  implements InventoryItemVendorAttributes
{
  declare itemId: string
  declare vendorId: string
  declare locationId: string
}
InventoryItemVendor.init(
  {
    ...baseModelColumns,
    itemId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inventory_items', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
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
    tableName: 'inventory_item_vendors',
    timestamps: true,
    indexes: [{ unique: true, fields: ['itemId', 'vendorId', 'locationId'] }],
  },
)
