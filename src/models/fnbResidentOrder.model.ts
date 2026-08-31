import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { FnbMealSlot, FnbOrderStatus } from '../enums/fnb.enum.js'
import type { FnbDish } from './fnbDish.model.js'
import type { FnbMenuItem } from './fnbMenuItem.model.js'
import type { Resident } from './resident.model.js'

export interface FnbResidentOrderAttributes extends BaseAttributes {
  locId: string
  residentId: string
  residentPackageId?: string | null
  menuItemId: string
  dishId: string
  date: Date | string
  mealSlot: FnbMealSlot
  quantity: number
  unitPrice: number
  totalAmount: number
  isPackageCovered: boolean
  orderStatus: FnbOrderStatus
}

export type FnbResidentOrderCreationAttributes = Optional<
  FnbResidentOrderAttributes,
  | 'id'
  | 'residentPackageId'
  | 'quantity'
  | 'unitPrice'
  | 'totalAmount'
  | 'isPackageCovered'
  | 'orderStatus'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class FnbResidentOrder
  extends BaseModel<FnbResidentOrderAttributes, FnbResidentOrderCreationAttributes>
  implements FnbResidentOrderAttributes
{
  declare locId: string
  declare residentId: string
  declare residentPackageId: string | null
  declare menuItemId: string
  declare dishId: string
  declare date: Date | string
  declare mealSlot: FnbMealSlot
  declare quantity: number
  declare unitPrice: number
  declare totalAmount: number
  declare isPackageCovered: boolean
  declare orderStatus: FnbOrderStatus

  declare resident?: Resident
  declare dish?: FnbDish
  declare menuItem?: FnbMenuItem
}

FnbResidentOrder.init(
  {
    ...baseModelColumns,
    locId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    residentId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    residentPackageId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    menuItemId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    dishId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    mealSlot: {
      type: DataTypes.ENUM('breakfast', 'lunch', 'snacks', 'dinner'),
      allowNull: false,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    unitPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('unitPrice')
        return val !== null ? Number(val) : 0
      },
    },
    totalAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('totalAmount')
        return val !== null ? Number(val) : 0
      },
    },
    isPackageCovered: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    orderStatus: {
      type: DataTypes.ENUM('placed', 'served', 'cancelled'),
      allowNull: false,
      defaultValue: FnbOrderStatus.PLACED,
    },
  },
  {
    sequelize,
    tableName: 'fnb_resident_orders',
    timestamps: true,
  },
)

export default FnbResidentOrder
