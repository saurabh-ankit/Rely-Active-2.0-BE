import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type NonAttribute,
} from 'sequelize'
import sequelize from '../config/db/index.js'
import type { FnbPropertyMealSlot } from './fnbPropertyMealSlot.model.js'

export class FnbGlobalMealSlot extends Model<
  InferAttributes<FnbGlobalMealSlot>,
  InferCreationAttributes<FnbGlobalMealSlot>
> {
  declare id: CreationOptional<string>
  declare name: string
  declare startTime: string
  declare endTime: string
  declare price: number
  declare description: string | null
  declare isActive: CreationOptional<boolean>
  declare createdBy: string | null
  declare updatedBy: string | null
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>

  declare propertyMealSlots?: NonAttribute<FnbPropertyMealSlot[]>
}

FnbGlobalMealSlot.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    startTime: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '07:30',
    },
    endTime: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '10:00',
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
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
    tableName: 'fnb_global_meal_slots',
    timestamps: true,
  },
)

export default FnbGlobalMealSlot
