import { DataTypes, type Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseModel, baseModelColumns, type BaseAttributes } from './base.model.js'
export interface InventoryCategoryAttributes extends BaseAttributes {
  name: string
  description: string | null
  image: string | null
  isActive: boolean
}
export type InventoryCategoryCreationAttributes = Optional<
  InventoryCategoryAttributes,
  'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt' | 'description' | 'image' | 'isActive'
>
export class InventoryCategory
  extends BaseModel<InventoryCategoryAttributes, InventoryCategoryCreationAttributes>
  implements InventoryCategoryAttributes
{
  declare name: string
  declare description: string | null
  declare image: string | null
  declare isActive: boolean
}
InventoryCategory.init(
  {
    ...baseModelColumns,
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    image: { type: DataTypes.STRING(500), allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { sequelize, tableName: 'inventory_categories', timestamps: true },
)
