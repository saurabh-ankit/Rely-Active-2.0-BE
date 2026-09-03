import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { GlobalService } from './globalService.model.js'

export interface GlobalServicePropertyAttributes extends BaseAttributes {
  locId: string
  globalServiceId: string
  price: number
  quantity: number
  isActive: boolean
}

export type GlobalServicePropertyCreationAttributes = Optional<
  GlobalServicePropertyAttributes,
  'id' | 'price' | 'quantity' | 'isActive' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class GlobalServiceProperty
  extends BaseModel<GlobalServicePropertyAttributes, GlobalServicePropertyCreationAttributes>
  implements GlobalServicePropertyAttributes
{
  declare locId: string
  declare globalServiceId: string
  declare price: number
  declare quantity: number
  declare isActive: boolean

  declare globalService?: GlobalService
}

GlobalServiceProperty.init(
  {
    ...baseModelColumns,
    locId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    globalServiceId: {
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
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'global_service_properties',
    timestamps: true,
  },
)

export default GlobalServiceProperty
