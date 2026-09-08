import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { EventGlobalService } from './eventGlobalService.model.js'

export interface EventGlobalServicePropertyAttributes extends BaseAttributes {
  locId: string
  globalServiceId: string
  price: number
  quantity: number
  isActive: boolean
}

export type EventGlobalServicePropertyCreationAttributes = Optional<
  EventGlobalServicePropertyAttributes,
  'id' | 'price' | 'quantity' | 'isActive' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class EventGlobalServiceProperty
  extends BaseModel<EventGlobalServicePropertyAttributes, EventGlobalServicePropertyCreationAttributes>
  implements EventGlobalServicePropertyAttributes
{
  declare locId: string
  declare globalServiceId: string
  declare price: number
  declare quantity: number
  declare isActive: boolean

  declare globalService?: EventGlobalService
}

EventGlobalServiceProperty.init(
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
    tableName: 'event_global_service_properties',
    timestamps: true,
  },
)

export default EventGlobalServiceProperty
