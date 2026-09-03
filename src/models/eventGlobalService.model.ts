import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { EventGlobalServiceProperty } from './eventGlobalServiceProperty.model.js'

export interface EventGlobalServiceAttributes extends BaseAttributes {
  name: string
  description?: string | null
  basePrice: number
  imageUrl?: string | null
  isActive: boolean
}

export type EventGlobalServiceCreationAttributes = Optional<
  EventGlobalServiceAttributes,
  'id' | 'description' | 'basePrice' | 'imageUrl' | 'isActive' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class EventGlobalService
  extends BaseModel<EventGlobalServiceAttributes, EventGlobalServiceCreationAttributes>
  implements EventGlobalServiceAttributes
{
  declare name: string
  declare description: string | null
  declare basePrice: number
  declare imageUrl: string | null
  declare isActive: boolean

  declare propertyServices?: EventGlobalServiceProperty[]
}

EventGlobalService.init(
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
    tableName: 'event_global_services',
    timestamps: true,
  },
)

export default EventGlobalService
