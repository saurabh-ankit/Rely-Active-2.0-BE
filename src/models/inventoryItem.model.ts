import { DataTypes, type Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseModel, baseModelColumns, type BaseAttributes } from './base.model.js'
export interface InventoryItemAttributes extends BaseAttributes {
  categoryId: string
  name: string
  isActive: boolean
  packType: string
  packQuantity: number
  packUnit: string
  minQuantity: number
  maxQuantity: number
  threshold: number
}
export type InventoryItemCreationAttributes = Optional<
  InventoryItemAttributes,
  | 'id'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
  | 'isActive'
  | 'minQuantity'
  | 'maxQuantity'
  | 'threshold'
>
export class InventoryItem
  extends BaseModel<InventoryItemAttributes, InventoryItemCreationAttributes>
  implements InventoryItemAttributes
{
  declare categoryId: string
  declare name: string
  declare isActive: boolean
  declare packType: string
  declare packQuantity: number
  declare minQuantity: number
  declare maxQuantity: number
  declare threshold: number
  declare packUnit: string
}
InventoryItem.init(
  {
    ...baseModelColumns,
    categoryId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inventory_categories', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
    minQuantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    maxQuantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    threshold: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    name: { type: DataTypes.STRING(255), allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    packType: { type: DataTypes.STRING(30), allowNull: false },
    packQuantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    packUnit: { type: DataTypes.STRING(30), allowNull: false },
  },
  { sequelize, tableName: 'inventory_items', timestamps: true },
)
