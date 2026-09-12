import { DataTypes, type Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseModel, baseModelColumns, type BaseAttributes } from './base.model.js'
export interface InventoryFieldDefinitionAttributes extends BaseAttributes {
  categoryId: string
  fieldName: string
  fieldLabel: string
  fieldType: 'text' | 'number' | 'select' | 'date' | 'boolean'
  isRequired: boolean
  defaultValue: string | number | boolean | null
  enumValues: string[]
  displayOrder: number
}
export type InventoryFieldDefinitionCreationAttributes = Optional<
  InventoryFieldDefinitionAttributes,
  | 'id'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
  | 'isRequired'
  | 'defaultValue'
  | 'enumValues'
  | 'displayOrder'
>
export class InventoryFieldDefinition
  extends BaseModel<InventoryFieldDefinitionAttributes, InventoryFieldDefinitionCreationAttributes>
  implements InventoryFieldDefinitionAttributes
{
  declare categoryId: string
  declare fieldName: string
  declare fieldLabel: string
  declare fieldType: 'text' | 'number' | 'select' | 'date' | 'boolean'
  declare isRequired: boolean
  declare defaultValue: string | number | boolean | null
  declare enumValues: string[]
  declare displayOrder: number
}
InventoryFieldDefinition.init(
  {
    ...baseModelColumns,
    categoryId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inventory_categories', key: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    },
    fieldName: { type: DataTypes.STRING(255), allowNull: false },
    fieldLabel: { type: DataTypes.STRING(255), allowNull: false },
    fieldType: { type: DataTypes.ENUM('text', 'number', 'select', 'date', 'boolean'), allowNull: false },
    isRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    defaultValue: { type: DataTypes.JSON, allowNull: true },
    enumValues: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    displayOrder: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  },
  {
    sequelize,
    tableName: 'inventory_field_definitions',
    timestamps: true,
    indexes: [{ unique: true, fields: ['categoryId', 'fieldName'] }],
  },
)
