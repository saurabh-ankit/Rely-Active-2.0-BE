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
  /** Last date occupied (inclusive) for a multi-day or overnight booking; null = `date` only. */
  endDate?: string | null
  startMinutes: number
  /** Slot end, or check-out time for a stay. */
  endMinutes?: number | null
  /** Slots, days or nights booked, and the price of each when booked. */
  unitCount?: number | null
  unitPrice?: number | null
  residentId: string
  status: AmenityBookingStatusType
  /** The amenity's price when booked (null or 0 when free); billed on the flat's invoice. */
  chargeAmount?: number | null
  notes?: string | null
  isActive: boolean
  isDeleted: boolean
}

export type AmenitySlotBookingCreationAttributes = Optional<
  AmenitySlotBookingAttributes,
  | 'id'
  | 'endDate'
  | 'endMinutes'
  | 'unitCount'
  | 'unitPrice'
  | 'status'
  | 'chargeAmount'
  | 'notes'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class AmenitySlotBooking
  extends BaseModel<AmenitySlotBookingAttributes, AmenitySlotBookingCreationAttributes>
  implements AmenitySlotBookingAttributes
{
  declare slotConfigId: string
  declare date: string
  declare endDate: string | null
  declare startMinutes: number
  declare endMinutes: number | null
  declare unitCount: number | null
  declare unitPrice: number | null
  declare residentId: string
  declare status: AmenityBookingStatusType
  declare chargeAmount: number | null
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
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    startMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    endMinutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    unitCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    unitPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
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
    chargeAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
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
