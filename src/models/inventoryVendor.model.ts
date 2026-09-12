import { DataTypes, type Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseModel, baseModelColumns, type BaseAttributes } from './base.model.js'
export interface InventoryVendorAttributes extends BaseAttributes {
  name: string
  contactPerson: string | null
  email: string | null
  phone: string | null
  address: string | null
  isActive: boolean
}
export type InventoryVendorCreationAttributes = Optional<
  InventoryVendorAttributes,
  | 'id'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
  | 'contactPerson'
  | 'email'
  | 'phone'
  | 'address'
  | 'isActive'
>
export class InventoryVendor
  extends BaseModel<InventoryVendorAttributes, InventoryVendorCreationAttributes>
  implements InventoryVendorAttributes
{
  declare name: string
  declare contactPerson: string | null
  declare email: string | null
  declare phone: string | null
  declare address: string | null
  declare isActive: boolean
}
InventoryVendor.init(
  {
    ...baseModelColumns,
    name: { type: DataTypes.STRING(255), allowNull: false },
    contactPerson: { type: DataTypes.STRING(255), allowNull: true },
    email: { type: DataTypes.STRING(255), allowNull: true },
    phone: { type: DataTypes.STRING(20), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { sequelize, tableName: 'inventory_vendors', timestamps: true },
)
