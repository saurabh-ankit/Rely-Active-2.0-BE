import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { FnbGlobalPackage } from './fnbGlobalPackage.model.js'

export interface FnbPropertyPackageAttributes extends BaseAttributes {
  locId: string
  globalPackageId: string
  price: number
  isActive: boolean
}

export type FnbPropertyPackageCreationAttributes = Optional<
  FnbPropertyPackageAttributes,
  'id' | 'price' | 'isActive' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class FnbPropertyPackage
  extends BaseModel<FnbPropertyPackageAttributes, FnbPropertyPackageCreationAttributes>
  implements FnbPropertyPackageAttributes
{
  declare locId: string
  declare globalPackageId: string
  declare price: number
  declare isActive: boolean

  declare globalPackage?: FnbGlobalPackage
}

FnbPropertyPackage.init(
  {
    ...baseModelColumns,
    locId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    globalPackageId: {
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
  },
  {
    sequelize,
    tableName: 'fnb_property_packages',
    timestamps: true,
  },
)
