import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { EventType, FrequencyType } from '../enums/event.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { AddOnService } from './eventVenue.model.js'

export interface EventAttributes extends BaseAttributes {
  eventType: EventType
  title: string
  description: string
  startDate: Date
  endDate: Date
  venueId: string
  allowReservation: boolean
  frequencyType: FrequencyType
  maxCapacity?: number | null
  reservationPerFlat?: number | null
  recurrenceDayOfWeek?: number | null
  recurrenceDaysOfWeek?: number[] | null
  recurrenceDayOfMonth?: number | null
  recurrenceMonth?: number | null
  poster?: string | null
  entryFee?: number | null
  selectedServices?: AddOnService[] | null
  locationId: string
  isActive: boolean
  isDeleted: boolean
}

export type EventCreationAttributes = Optional<
  EventAttributes,
  | 'id'
  | 'poster'
  | 'entryFee'
  | 'selectedServices'
  | 'maxCapacity'
  | 'reservationPerFlat'
  | 'recurrenceDayOfWeek'
  | 'recurrenceDaysOfWeek'
  | 'recurrenceDayOfMonth'
  | 'recurrenceMonth'
  | 'allowReservation'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class Event extends BaseModel<EventAttributes, EventCreationAttributes> implements EventAttributes {
  declare eventType: EventType
  declare title: string
  declare description: string
  declare startDate: Date
  declare endDate: Date
  declare venueId: string
  declare allowReservation: boolean
  declare frequencyType: FrequencyType
  declare maxCapacity: number | null
  declare reservationPerFlat: number | null
  declare recurrenceDayOfWeek: number | null
  declare recurrenceDaysOfWeek: number[] | null
  declare recurrenceDayOfMonth: number | null
  declare recurrenceMonth: number | null
  declare poster: string | null
  declare entryFee: number | null
  declare selectedServices: AddOnService[] | null
  declare locationId: string
  declare isActive: boolean
  declare isDeleted: boolean
}

Event.init(
  {
    ...baseModelColumns,
    eventType: {
      type: DataTypes.ENUM(...Object.values(EventType)),
      allowNull: false,
    },
    title: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    startDate: { type: DataTypes.DATE, allowNull: false },
    endDate: { type: DataTypes.DATE, allowNull: false },
    venueId: { type: DataTypes.UUID, allowNull: false },
    allowReservation: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    frequencyType: {
      type: DataTypes.ENUM(...Object.values(FrequencyType)),
      allowNull: false,
    },
    maxCapacity: { type: DataTypes.INTEGER, allowNull: true },
    reservationPerFlat: { type: DataTypes.INTEGER, allowNull: true },
    recurrenceDayOfWeek: { type: DataTypes.TINYINT, allowNull: true },
    recurrenceDaysOfWeek: { type: DataTypes.JSON, allowNull: true },
    recurrenceDayOfMonth: { type: DataTypes.TINYINT, allowNull: true },
    recurrenceMonth: { type: DataTypes.TINYINT, allowNull: true },
    poster: { type: DataTypes.STRING(500), allowNull: true },
    entryFee: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    selectedServices: { type: DataTypes.JSON, allowNull: true },
    locationId: { type: DataTypes.UUID, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, tableName: 'events', timestamps: true },
)

export default Event
