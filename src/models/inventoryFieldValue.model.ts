import { DataTypes, type Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseModel, baseModelColumns, type BaseAttributes } from './base.model.js'
export interface InventoryFieldValueAttributes extends BaseAttributes {
  itemId: string
  fieldDefinitionId: string
  value: string | number | boolean | null
}
export type InventoryFieldValueCreationAttributes = Optional<
  InventoryFieldValueAttributes,
  'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt' | 'value'
>
export class InventoryFieldValue
  extends BaseModel<InventoryFieldValueAttributes, InventoryFieldValueCreationAttributes>
  implements InventoryFieldValueAttributes
{
  declare itemId: string
  declare fieldDefinitionId: string
  declare value: string | number | boolean | null
}
InventoryFieldValue.init(
  {
    ...baseModelColumns,
    itemId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inventory_items', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
    fieldDefinitionId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inventory_field_definitions', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
    value: { type: DataTypes.JSON, allowNull: true },
  },
  {
    sequelize,
    tableName: 'inventory_field_values',
    timestamps: true,
    indexes: [{ unique: true, fields: ['itemId', 'fieldDefinitionId'] }],
  },
)
