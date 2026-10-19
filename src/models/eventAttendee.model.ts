import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

import type { ResidentFamilyMember } from './residentFamilyMember.model.js'
import type { User } from './user.model.js'

/** One person who came to an event under a reservation: the resident, or a family member. */
export interface EventAttendeeAttributes extends BaseAttributes {
  registrationId: string
  eventId: string
  residentId: string
  /** Null when the resident themself attended. */
  familyMemberId?: string | null
  markedBy?: string | null
  markedAt: Date
}

export type EventAttendeeCreationAttributes = Optional<
  EventAttendeeAttributes,
  'id' | 'familyMemberId' | 'markedBy' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class EventAttendee
  extends BaseModel<EventAttendeeAttributes, EventAttendeeCreationAttributes>
  implements EventAttendeeAttributes
{
  declare registrationId: string
  declare eventId: string
  declare residentId: string
  declare familyMemberId: string | null
  declare markedBy: string | null
  declare markedAt: Date

  declare familyMember?: ResidentFamilyMember | null
  declare marker?: User | null
}

EventAttendee.init(
  {
    ...baseModelColumns,
    registrationId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> event_registrations.id' },
    eventId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> events.id' },
    residentId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> residents.id' },
    familyMemberId: { type: DataTypes.UUID, allowNull: true, comment: 'FK -> resident_family_members.id' },
    markedBy: { type: DataTypes.UUID, allowNull: true, comment: 'FK -> users.id (attendance staff)' },
    markedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'event_attendees',
    timestamps: true,
  },
)

export default EventAttendee
