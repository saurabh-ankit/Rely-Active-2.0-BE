import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type NonAttribute,
} from 'sequelize'
import sequelize from '../config/db/index.js'
import type { FnbGlobalMealSlot } from './fnbGlobalMealSlot.model.js'

export class FnbPropertyMealSlot extends Model<
  InferAttributes<FnbPropertyMealSlot>,
  InferCreationAttributes<FnbPropertyMealSlot>
> {
  declare id: CreationOptional<string>
  declare locId: string
  declare globalMealSlotId: string
  declare startTime: string | null
  declare endTime: string | null
  declare price: number | null
  declare isActive: CreationOptional<boolean>
  declare createdBy: string | null
  declare updatedBy: string | null
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>

  declare globalMealSlot?: NonAttribute<FnbGlobalMealSlot>
}

FnbPropertyMealSlot.init(
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
    globalMealSlotId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    startTime: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    endTime: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
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
    tableName: 'fnb_property_meal_slots',
    timestamps: true,
  },
)

export default FnbPropertyMealSlot
