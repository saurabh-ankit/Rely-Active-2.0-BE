import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type NonAttribute,
} from 'sequelize'
import sequelize from '../config/db/index.js'
import type { FnbResidentOrder } from './fnbResidentOrder.model.js'
import type { FnbDish } from './fnbDish.model.js'
import type { FnbGlobalMealSlot } from './fnbGlobalMealSlot.model.js'
import type { FnbPropertySpecialSlot } from './fnbPropertySpecialSlot.model.js'
import type { FnbPropertySpecialSlotDish } from './fnbPropertySpecialSlotDish.model.js'

export class FnbResidentOrderDetail extends Model<
  InferAttributes<FnbResidentOrderDetail>,
  InferCreationAttributes<FnbResidentOrderDetail>
> {
  declare id: CreationOptional<string>
  declare orderId: string
  declare dishId: string
  declare mealSlotId: string | null
  declare specialMealSlotId: string | null
  declare specialMealSlotDishId: string | null
  declare quantity: number
  declare unitPrice: number
  declare amount: number
  declare isPackageCovered: boolean
  declare notes: string | null
  declare createdBy: string | null
  declare updatedBy: string | null
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>

  declare order?: NonAttribute<FnbResidentOrder>
  declare dish?: NonAttribute<FnbDish>
  declare globalMealSlot?: NonAttribute<FnbGlobalMealSlot>
  declare specialMealSlot?: NonAttribute<FnbPropertySpecialSlot>
  declare specialMealSlotDish?: NonAttribute<FnbPropertySpecialSlotDish>
}

FnbResidentOrderDetail.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    orderId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    dishId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    mealSlotId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    specialMealSlotId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    specialMealSlotDishId: {
      type: DataTypes.UUID,
      allowNull: true,
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
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('amount')
        return val !== null ? Number(val) : 0
      },
    },
    isPackageCovered: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    updatedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'fnb_resident_order_details',
    timestamps: true,
  },
)

export default FnbResidentOrderDetail
