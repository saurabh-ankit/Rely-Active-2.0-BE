import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { FnbMealSlot } from '../enums/fnb.enum.js'
import type { FnbDish } from './fnbDish.model.js'
import type { FnbMenu } from './fnbMenu.model.js'

export interface FnbMenuItemAttributes extends BaseAttributes {
  menuId: string
  locId: string
  dayOfWeek?: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday' | null
  date?: Date | string | null
  isOverride?: boolean
  mealSlot: FnbMealSlot
  dishId: string
  isOptional: boolean
  extraPrice: number
  notes?: string | null
}

export type FnbMenuItemCreationAttributes = Optional<
  FnbMenuItemAttributes,
  | 'id'
  | 'dayOfWeek'
  | 'date'
  | 'isOverride'
  | 'isOptional'
  | 'extraPrice'
  | 'notes'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class FnbMenuItem
  extends BaseModel<FnbMenuItemAttributes, FnbMenuItemCreationAttributes>
  implements FnbMenuItemAttributes
{
  declare menuId: string
  declare locId: string
  declare dayOfWeek?: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday' | null
  declare date?: Date | string | null
  declare isOverride?: boolean
  declare mealSlot: FnbMealSlot
  declare dishId: string
  declare isOptional: boolean
  declare extraPrice: number
  declare notes: string | null

  declare dish?: FnbDish
  declare menu?: FnbMenu
}

FnbMenuItem.init(
  {
    ...baseModelColumns,
    menuId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    locId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    dayOfWeek: {
      type: DataTypes.ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'),
      allowNull: true,
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    isOverride: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    mealSlot: {
      type: DataTypes.ENUM('breakfast', 'lunch', 'snacks', 'dinner'),
      allowNull: false,
    },
    dishId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    isOptional: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    extraPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('extraPrice')
        return val !== null ? Number(val) : 0
      },
    },
    notes: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'fnb_menu_items',
    timestamps: true,
  },
)

export default FnbMenuItem
