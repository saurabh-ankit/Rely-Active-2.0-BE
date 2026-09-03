import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { RegistrationStatus } from '../enums/event.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface EventRegistrationAttributes extends BaseAttributes {
  eventId: string
  residentId: string
  status: RegistrationStatus
  registeredAt: Date
  registrationDate: string
  cancelledAt?: Date | null
  cancellationReason?: string | null
  attendedAt?: Date | null
  notes?: string | null
  locationId: string
  isActive: boolean
  isDeleted: boolean
}

export type EventRegistrationCreationAttributes = Optional<
  EventRegistrationAttributes,
  | 'id'
  | 'status'
  | 'cancelledAt'
  | 'cancellationReason'
  | 'attendedAt'
  | 'notes'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class EventRegistration
  extends BaseModel<EventRegistrationAttributes, EventRegistrationCreationAttributes>
  implements EventRegistrationAttributes
{
  declare eventId: string
  declare residentId: string
  declare status: RegistrationStatus
  declare registeredAt: Date
  declare registrationDate: string
  declare cancelledAt: Date | null
  declare cancellationReason: string | null
  declare attendedAt: Date | null
  declare notes: string | null
  declare locationId: string
  declare isActive: boolean
  declare isDeleted: boolean
}

EventRegistration.init(
  {
    ...baseModelColumns,
    eventId: { type: DataTypes.UUID, allowNull: false },
    residentId: { type: DataTypes.UUID, allowNull: false },
    status: {
      type: DataTypes.ENUM(...Object.values(RegistrationStatus)),
      allowNull: false,
      defaultValue: RegistrationStatus.PENDING,
    },
    registeredAt: { type: DataTypes.DATE, allowNull: false },
    registrationDate: { type: DataTypes.DATEONLY, allowNull: false },
    cancelledAt: { type: DataTypes.DATE, allowNull: true },
    cancellationReason: { type: DataTypes.STRING(500), allowNull: true },
    attendedAt: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    locationId: { type: DataTypes.UUID, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, tableName: 'event_registrations', timestamps: true },
)

export default EventRegistration
