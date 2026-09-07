import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type NonAttribute,
} from 'sequelize'
import sequelize from '../config/db/index.js'
import type { FnbGlobalSpecialSlot } from './fnbGlobalSpecialSlot.model.js'
import type { FnbPropertySpecialSlotDish } from './fnbPropertySpecialSlotDish.model.js'

export class FnbPropertySpecialSlot extends Model<
  InferAttributes<FnbPropertySpecialSlot>,
  InferCreationAttributes<FnbPropertySpecialSlot>
> {
  declare id: CreationOptional<string>
  declare globalSpecialSlotId: string
  declare locId: string
  declare name: string
  declare description: string | null
  declare price: number
  declare isActive: CreationOptional<boolean>
  declare createdBy: string | null
  declare updatedBy: string | null
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>

  declare globalSpecialSlot?: NonAttribute<FnbGlobalSpecialSlot>
  declare specialDishes?: NonAttribute<FnbPropertySpecialSlotDish[]>
}

FnbPropertySpecialSlot.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    globalSpecialSlotId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    locId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
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
    tableName: 'fnb_property_special_slots',
    timestamps: true,
  },
)
