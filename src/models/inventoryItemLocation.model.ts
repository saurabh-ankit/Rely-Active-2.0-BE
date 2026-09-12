import { DataTypes, type Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseModel, baseModelColumns, type BaseAttributes } from './base.model.js'
export interface InventoryItemLocationAttributes extends BaseAttributes {
  itemId: string
  locationId: string
  minQuantity: number
  maxQuantity: number
  threshold: number
}
export type InventoryItemLocationCreationAttributes = Optional<
  InventoryItemLocationAttributes,
  'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt' | 'minQuantity' | 'maxQuantity' | 'threshold'
>
export class InventoryItemLocation
  extends BaseModel<InventoryItemLocationAttributes, InventoryItemLocationCreationAttributes>
  implements InventoryItemLocationAttributes
{
  declare itemId: string
  declare minQuantity: number
  declare maxQuantity: number
  declare threshold: number
  declare locationId: string
}
InventoryItemLocation.init(
  {
    ...baseModelColumns,
    minQuantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    maxQuantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    threshold: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    itemId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inventory_items', key: 'id' },
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
    tableName: 'inventory_item_locations',
    timestamps: true,
    indexes: [{ unique: true, fields: ['itemId', 'locationId'] }],
  },
)
