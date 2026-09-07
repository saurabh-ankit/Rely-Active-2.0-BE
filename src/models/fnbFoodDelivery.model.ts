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
import type { User } from './user.model.js'
import type { UserDetail } from './userDetail.model.js'

export class FnbFoodDelivery extends Model<InferAttributes<FnbFoodDelivery>, InferCreationAttributes<FnbFoodDelivery>> {
  declare id: CreationOptional<string>
  declare locId: string
  declare orderId: string
  declare employeeId: string | null
  declare deliveryCharge: number
  declare deliveryStatus: 'assigned' | 'delivering' | 'delivered' | 'failed'
  declare photoUrl: string | null
  declare deliveryDate: string | null
  declare deliveredAt: Date | null
  declare createdBy: string | null
  declare updatedBy: string | null
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>

  declare order?: NonAttribute<FnbResidentOrder>
  declare employee?: NonAttribute<User>
  declare employeeDetail?: NonAttribute<UserDetail>
}

FnbFoodDelivery.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    locId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    orderId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    employeeId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    deliveryCharge: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('deliveryCharge')
        return val !== null ? Number(val) : 0
      },
    },
    deliveryStatus: {
      type: DataTypes.ENUM('assigned', 'delivering', 'delivered', 'failed'),
      allowNull: false,
      defaultValue: 'assigned',
    },
    photoUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    deliveryDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    deliveredAt: {
      type: DataTypes.DATE,
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
    tableName: 'fnb_food_deliveries',
    timestamps: true,
  },
)

export default FnbFoodDelivery
