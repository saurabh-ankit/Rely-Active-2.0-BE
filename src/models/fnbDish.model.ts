import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { FnbDietaryType, FnbDishCategory } from '../enums/fnb.enum.js'

export interface FnbDishAttributes extends BaseAttributes {
  name: string
  category: FnbDishCategory | string
  dietaryType: FnbDietaryType
  description?: string | null
  basePrice: number
  nutritionalInfo?: Record<string, unknown> | null
  imageUrl?: string | null
  isActive: boolean
}

export type FnbDishCreationAttributes = Optional<
  FnbDishAttributes,
  | 'id'
  | 'description'
  | 'basePrice'
  | 'dietaryType'
  | 'nutritionalInfo'
  | 'imageUrl'
  | 'isActive'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class FnbDish extends BaseModel<FnbDishAttributes, FnbDishCreationAttributes> implements FnbDishAttributes {
  declare name: string
  declare category: FnbDishCategory | string
  declare dietaryType: FnbDietaryType
  declare description: string | null
  declare basePrice: number
  declare nutritionalInfo: Record<string, unknown> | null
  declare imageUrl: string | null
  declare isActive: boolean
}

FnbDish.init(
  {
    ...baseModelColumns,
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    category: {
      type: DataTypes.ENUM(
        'breakfast',
        'starters',
        'main_course',
        'breads',
        'rice_biryani',
        'snacks_desserts',
        'beverages',
        'other',
      ),
      allowNull: false,
      defaultValue: FnbDishCategory.MAIN_COURSE,
    },
    dietaryType: {
      type: DataTypes.ENUM('veg', 'non_veg', 'egg', 'jain', 'vegan'),
      allowNull: false,
      defaultValue: FnbDietaryType.VEG,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    basePrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('basePrice')
        return val !== null ? Number(val) : 0
      },
    },
    nutritionalInfo: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    imageUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'fnb_dishes',
    timestamps: true,
  },
)

export default FnbDish
