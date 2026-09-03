import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { GlobalServiceProperty } from './globalServiceProperty.model.js'

export interface GlobalServiceAttributes extends BaseAttributes {
  name: string
  description?: string | null
  basePrice: number
  imageUrl?: string | null
  isActive: boolean
}

export type GlobalServiceCreationAttributes = Optional<
  GlobalServiceAttributes,
  'id' | 'description' | 'basePrice' | 'imageUrl' | 'isActive' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class GlobalService
  extends BaseModel<GlobalServiceAttributes, GlobalServiceCreationAttributes>
  implements GlobalServiceAttributes
{
  declare name: string
  declare description: string | null
  declare basePrice: number
  declare imageUrl: string | null
  declare isActive: boolean

  declare propertyServices?: GlobalServiceProperty[]
}

GlobalService.init(
  {
    ...baseModelColumns,
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
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
    tableName: 'global_services',
    timestamps: true,
  },
)

export default GlobalService
