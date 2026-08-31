import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { FnbDish } from './fnbDish.model.js'

export interface FnbPropertyDishAttributes extends BaseAttributes {
  locId: string
  dishId: string
  price: number
  isAvailable: boolean
}

export type FnbPropertyDishCreationAttributes = Optional<
  FnbPropertyDishAttributes,
  'id' | 'price' | 'isAvailable' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class FnbPropertyDish
  extends BaseModel<FnbPropertyDishAttributes, FnbPropertyDishCreationAttributes>
  implements FnbPropertyDishAttributes
{
  declare locId: string
  declare dishId: string
  declare price: number
  declare isAvailable: boolean

  declare dish?: FnbDish
}

FnbPropertyDish.init(
  {
    ...baseModelColumns,
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
    isAvailable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'fnb_property_dishes',
    timestamps: true,
  },
)

export default FnbPropertyDish
