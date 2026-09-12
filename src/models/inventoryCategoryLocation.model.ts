import { DataTypes, type Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseModel, baseModelColumns, type BaseAttributes } from './base.model.js'
export interface InventoryCategoryLocationAttributes extends BaseAttributes {
  categoryId: string
  locationId: string
}
export type InventoryCategoryLocationCreationAttributes = Optional<
  InventoryCategoryLocationAttributes,
  'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>
export class InventoryCategoryLocation
  extends BaseModel<InventoryCategoryLocationAttributes, InventoryCategoryLocationCreationAttributes>
  implements InventoryCategoryLocationAttributes
{
  declare categoryId: string
  declare locationId: string
}
InventoryCategoryLocation.init(
  {
    ...baseModelColumns,
    categoryId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'inventory_categories', key: 'id' },
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
    tableName: 'inventory_category_locations',
    timestamps: true,
    indexes: [{ unique: true, fields: ['categoryId', 'locationId'] }],
  },
)
