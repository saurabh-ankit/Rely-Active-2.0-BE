import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export type OpdBookingStatus = 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW'

export interface RosterOpdBookingAttributes extends BaseAttributes {
  opdSlotId: string
  residentId: string
  bookedByUserId?: string | null
  status?: OpdBookingStatus
  notes?: string | null
  cancelledReason?: string | null
  activeToken?: string
  isDeleted?: boolean
}

export type RosterOpdBookingCreationAttributes = Optional<
  RosterOpdBookingAttributes,
  | 'id'
  | 'bookedByUserId'
  | 'status'
  | 'notes'
  | 'cancelledReason'
  | 'activeToken'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class RosterOpdBooking
  extends BaseModel<RosterOpdBookingAttributes, RosterOpdBookingCreationAttributes>
  implements RosterOpdBookingAttributes
{
  declare opdSlotId: string
  declare residentId: string
  declare bookedByUserId: string | null
  declare status: OpdBookingStatus
  declare notes: string | null
  declare cancelledReason: string | null
  declare activeToken: string
  declare isDeleted: boolean
}

RosterOpdBooking.init(
  {
    ...baseModelColumns,
    opdSlotId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    residentId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    bookedByUserId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'),
      allowNull: false,
      defaultValue: 'CONFIRMED',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    cancelledReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    activeToken: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'roster_opd_bookings',
    timestamps: true,
  },
)

export default RosterOpdBooking
