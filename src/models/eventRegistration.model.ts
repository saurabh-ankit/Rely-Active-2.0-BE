import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { RegistrationStatus } from '../enums/event.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface EventRegistrationAttributes extends BaseAttributes {
  eventId: string
  residentId: string
  /** Set when a family member of the resident attended (walk-in at an event without reservations). */
  familyMemberId?: string | null
  status: RegistrationStatus
  registeredAt: Date
  registrationDate: string
  seatCount: number
  cancelledAt?: Date | null
  cancellationReason?: string | null
  attendedAt?: Date | null
  /** Staff member who marked the registration Attended / No-show. */
  attendanceMarkedBy?: string | null
  notes?: string | null
  locationId: string
  isActive: boolean
  isDeleted: boolean
}

export type EventRegistrationCreationAttributes = Optional<
  EventRegistrationAttributes,
  | 'id'
  | 'familyMemberId'
  | 'status'
  | 'seatCount'
  | 'cancelledAt'
  | 'cancellationReason'
  | 'attendedAt'
  | 'attendanceMarkedBy'
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
  declare familyMemberId: string | null
  declare status: RegistrationStatus
  declare registeredAt: Date
  declare registrationDate: string
  declare seatCount: number
  declare cancelledAt: Date | null
  declare cancellationReason: string | null
  declare attendedAt: Date | null
  declare attendanceMarkedBy: string | null
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
    familyMemberId: { type: DataTypes.UUID, allowNull: true, comment: 'FK -> resident_family_members.id' },
    registeredAt: { type: DataTypes.DATE, allowNull: false },
    registrationDate: { type: DataTypes.DATEONLY, allowNull: false },
    seatCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    cancelledAt: { type: DataTypes.DATE, allowNull: true },
    cancellationReason: { type: DataTypes.STRING(500), allowNull: true },
    attendedAt: { type: DataTypes.DATE, allowNull: true },
    attendanceMarkedBy: { type: DataTypes.UUID, allowNull: true, comment: 'FK -> users.id' },
    notes: { type: DataTypes.TEXT, allowNull: true },
    locationId: { type: DataTypes.UUID, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, tableName: 'event_registrations', timestamps: true },
)

export default EventRegistration
