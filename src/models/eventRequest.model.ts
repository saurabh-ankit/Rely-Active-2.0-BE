import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { EventRequestStatus } from '../enums/event.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { AddOnService } from './eventVenue.model.js'

export type EventRequestScheduleSlot = {
  startDate: string | Date
  endDate: string | Date
}

export interface EventRequestAttributes extends BaseAttributes {
  title: string
  startDate: Date
  endDate: Date
  occupancy: number
  venueId: string
  customRequest?: string | null
  schedule?: EventRequestScheduleSlot[] | null
  selectedServices?: AddOnService[] | null
  requestNumber?: string | null
  residentId: string
  locationId: string
  status: EventRequestStatus
  meetingScheduledAt?: Date | null
  confirmedEventId?: string | null
  cancellationReason?: string | null
  isActive: boolean
  isDeleted: boolean
}

export type EventRequestCreationAttributes = Optional<
  EventRequestAttributes,
  | 'id'
  | 'customRequest'
  | 'schedule'
  | 'selectedServices'
  | 'requestNumber'
  | 'status'
  | 'meetingScheduledAt'
  | 'confirmedEventId'
  | 'cancellationReason'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class EventRequest
  extends BaseModel<EventRequestAttributes, EventRequestCreationAttributes>
  implements EventRequestAttributes
{
  declare title: string
  declare startDate: Date
  declare endDate: Date
  declare occupancy: number
  declare venueId: string
  declare customRequest: string | null
  declare schedule: EventRequestScheduleSlot[] | null
  declare selectedServices: AddOnService[] | null
  declare requestNumber: string | null
  declare residentId: string
  declare locationId: string
  declare status: EventRequestStatus
  declare meetingScheduledAt: Date | null
  declare confirmedEventId: string | null
  declare cancellationReason: string | null
  declare isActive: boolean
  declare isDeleted: boolean
}

EventRequest.init(
  {
    ...baseModelColumns,
    title: { type: DataTypes.STRING(255), allowNull: false },
    startDate: { type: DataTypes.DATE, allowNull: false },
    endDate: { type: DataTypes.DATE, allowNull: false },
    occupancy: { type: DataTypes.INTEGER, allowNull: false },
    venueId: { type: DataTypes.UUID, allowNull: false },
    customRequest: { type: DataTypes.TEXT, allowNull: true },
    schedule: { type: DataTypes.JSON, allowNull: true },
    selectedServices: { type: DataTypes.JSON, allowNull: true },
    requestNumber: { type: DataTypes.STRING(64), allowNull: true, unique: true },
    residentId: { type: DataTypes.UUID, allowNull: false },
    locationId: { type: DataTypes.UUID, allowNull: false },
    status: {
      type: DataTypes.ENUM(...Object.values(EventRequestStatus)),
      allowNull: false,
      defaultValue: EventRequestStatus.OPEN,
    },
    meetingScheduledAt: { type: DataTypes.DATE, allowNull: true },
    confirmedEventId: { type: DataTypes.UUID, allowNull: true },
    cancellationReason: { type: DataTypes.TEXT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, tableName: 'event_requests', timestamps: true },
)

export default EventRequest
