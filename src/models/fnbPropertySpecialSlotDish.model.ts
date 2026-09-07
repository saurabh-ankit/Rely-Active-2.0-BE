import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type NonAttribute,
} from 'sequelize'
import sequelize from '../config/db/index.js'
import type { FnbPropertySpecialSlot } from './fnbPropertySpecialSlot.model.js'
import type { FnbDish } from './fnbDish.model.js'

export class FnbPropertySpecialSlotDish extends Model<
  InferAttributes<FnbPropertySpecialSlotDish>,
  InferCreationAttributes<FnbPropertySpecialSlotDish>
> {
  declare id: CreationOptional<string>
  declare propertySpecialSlotId: string
  declare locId: string
  declare dishId: string
  declare price: number
  declare isActive: CreationOptional<boolean>
  declare createdBy: string | null
  declare updatedBy: string | null
  declare createdAt: CreationOptional<Date>
  declare updatedAt: CreationOptional<Date>

  declare propertySpecialSlot?: NonAttribute<FnbPropertySpecialSlot>
  declare dish?: NonAttribute<FnbDish>
}

FnbPropertySpecialSlotDish.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    propertySpecialSlotId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    locId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    dishId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('price')
        return val !== null ? Number(val) : 0
      },
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
    tableName: 'fnb_property_special_dishes',
    timestamps: true,
  },
)

export default FnbPropertySpecialSlotDish
