import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export const AmenityBookingUnit = {
  /** Timed slots of durationMin within the opening hours. */
  SLOT: 'SLOT',
  /** One booking per whole day (open → close); a booking can span several days. */
  FULL_DAY: 'FULL_DAY',
  /** Overnight stays: check-in at openMinutes, check-out at checkOutMinutes the next day. */
  NIGHT: 'NIGHT',
} as const

export type AmenityBookingUnitType = (typeof AmenityBookingUnit)[keyof typeof AmenityBookingUnit]

export interface AmenitySlotConfigAttributes extends BaseAttributes {
  propertyAmenityId: string
  openMinutes: number
  closeMinutes: number
  durationMin: number
  capacity: number
  daysOfWeek: number[]
  bookingUnit: AmenityBookingUnitType
  checkOutMinutes?: number | null
  isActive: boolean
  isDeleted: boolean
}

export type AmenitySlotConfigCreationAttributes = Optional<
  AmenitySlotConfigAttributes,
  | 'id'
  | 'daysOfWeek'
  | 'bookingUnit'
  | 'checkOutMinutes'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class AmenitySlotConfig
  extends BaseModel<AmenitySlotConfigAttributes, AmenitySlotConfigCreationAttributes>
  implements AmenitySlotConfigAttributes
{
  declare propertyAmenityId: string
  declare openMinutes: number
  declare closeMinutes: number
  declare durationMin: number
  declare capacity: number
  declare daysOfWeek: number[]
  declare bookingUnit: AmenityBookingUnitType
  declare checkOutMinutes: number | null
  declare isActive: boolean
  declare isDeleted: boolean
}

AmenitySlotConfig.init(
  {
    ...baseModelColumns,
    propertyAmenityId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    openMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    closeMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    durationMin: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    capacity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    daysOfWeek: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [0, 1, 2, 3, 4, 5, 6],
    },
    bookingUnit: {
      type: DataTypes.ENUM(...Object.values(AmenityBookingUnit)),
      allowNull: false,
      defaultValue: AmenityBookingUnit.SLOT,
    },
    checkOutMinutes: {
      type: DataTypes.INTEGER,
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
    tableName: 'amenity_slot_configs',
    timestamps: true,
    indexes: [
      { fields: ['propertyAmenityId'], name: 'amenity_slot_configs_property_amenity_unique', unique: true },
      { fields: ['isDeleted'], name: 'amenity_slot_configs_deleted_idx' },
    ],
  },
)

export default AmenitySlotConfig
