import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export const AmenityBookingStatus = {
  BOOKED: 'BOOKED',
  CANCELLED: 'CANCELLED',
} as const

export type AmenityBookingStatusType = (typeof AmenityBookingStatus)[keyof typeof AmenityBookingStatus]

export interface AmenitySlotBookingAttributes extends BaseAttributes {
  slotConfigId: string
  date: string
  startMinutes: number
  residentId: string
  status: AmenityBookingStatusType
  notes?: string | null
  isActive: boolean
  isDeleted: boolean
}

export type AmenitySlotBookingCreationAttributes = Optional<
  AmenitySlotBookingAttributes,
  'id' | 'status' | 'notes' | 'isActive' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class AmenitySlotBooking
  extends BaseModel<AmenitySlotBookingAttributes, AmenitySlotBookingCreationAttributes>
  implements AmenitySlotBookingAttributes
{
  declare slotConfigId: string
  declare date: string
  declare startMinutes: number
  declare residentId: string
  declare status: AmenityBookingStatusType
  declare notes: string | null
  declare isActive: boolean
  declare isDeleted: boolean
}

AmenitySlotBooking.init(
  {
    ...baseModelColumns,
    slotConfigId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    startMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    residentId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(AmenityBookingStatus)),
      allowNull: false,
      defaultValue: AmenityBookingStatus.BOOKED,
    },
    notes: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'amenity_slot_bookings',
    timestamps: true,
    indexes: [
      {
        fields: ['slotConfigId', 'date', 'startMinutes', 'status', 'isDeleted'],
        name: 'amenity_slot_bookings_lookup_idx',
      },
      { fields: ['residentId', 'date', 'isDeleted'], name: 'amenity_slot_bookings_resident_idx' },
    ],
  },
)

export default AmenitySlotBooking
