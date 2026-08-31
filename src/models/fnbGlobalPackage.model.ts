import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { FnbDietaryType, FnbMealSlot } from '../enums/fnb.enum.js'
import type { FnbPropertyPackage } from './fnbPropertyPackage.model.js'

export interface FnbGlobalPackageAttributes extends BaseAttributes {
  name: string
  code: string
  description?: string | null
  dietaryType: FnbDietaryType
  includedMealSlots: FnbMealSlot[] | string[]
  isActive: boolean
}

export type FnbGlobalPackageCreationAttributes = Optional<
  FnbGlobalPackageAttributes,
  | 'id'
  | 'description'
  | 'dietaryType'
  | 'includedMealSlots'
  | 'isActive'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class FnbGlobalPackage
  extends BaseModel<FnbGlobalPackageAttributes, FnbGlobalPackageCreationAttributes>
  implements FnbGlobalPackageAttributes
{
  declare name: string
  declare code: string
  declare description: string | null
  declare dietaryType: FnbDietaryType
  declare includedMealSlots: FnbMealSlot[] | string[]
  declare isActive: boolean

  declare propertyPackages?: FnbPropertyPackage[]
}

FnbGlobalPackage.init(
  {
    ...baseModelColumns,
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    dietaryType: {
      type: DataTypes.ENUM('veg', 'non_veg', 'egg', 'jain', 'mixed', 'vegan'),
      allowNull: false,
      defaultValue: FnbDietaryType.VEG,
    },
    includedMealSlots: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: ['breakfast', 'lunch', 'snacks', 'dinner'],
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'fnb_global_packages',
    timestamps: true,
  },
)

export default FnbGlobalPackage
