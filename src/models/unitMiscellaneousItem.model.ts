import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel } from './base.model.js'
import type { Resident } from './resident.model.js'
import type { PropertyUnit } from './propertyUnit.model.js'
import type { User } from './user.model.js'

export interface UnitMiscellaneousItemAttributes extends BaseAttributes {
  residentId?: string | null
  unitId?: string | null
  employeeId?: string | null
  inventoryItemId?: string | null
  itemName: string
  totalQuantity: number
  quantityTaken: number
  unitPrice: number
  price: number
  unit: string
  date: Date | string
  time: string
  notes?: string | null
  imageUrl?: string | null
  loc_id: string
  isBilled: boolean
  invoiceId?: string | null
}

export type UnitMiscellaneousItemCreationAttributes = Optional<
  UnitMiscellaneousItemAttributes,
  'id' | 'residentId' | 'unitId' | 'employeeId' | 'inventoryItemId' | 'notes' | 'imageUrl' | 'isBilled' | 'invoiceId'
>

export class UnitMiscellaneousItem
  extends BaseModel<UnitMiscellaneousItemAttributes, UnitMiscellaneousItemCreationAttributes>
  implements UnitMiscellaneousItemAttributes
{
  declare residentId: string | null
  declare unitId: string | null
  declare employeeId: string | null
  declare inventoryItemId: string | null
  declare itemName: string
  declare totalQuantity: number
  declare quantityTaken: number
  declare unitPrice: number
  declare price: number
  declare unit: string
  declare date: Date
  declare time: string
  declare notes: string | null
  declare imageUrl: string | null
  declare loc_id: string
  declare isBilled: boolean
  declare invoiceId: string | null

  declare resident?: Resident
  declare propertyUnit?: PropertyUnit
  declare employee?: User
}

UnitMiscellaneousItem.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    residentId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    unitId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    employeeId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    inventoryItemId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    itemName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    totalQuantity: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    quantityTaken: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    unitPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    unit: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    time: {
      type: DataTypes.TIME,
      allowNull: false,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    imageUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    loc_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    isBilled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    invoiceId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'unit_miscellaneous_items',
    timestamps: true,
  },
)
