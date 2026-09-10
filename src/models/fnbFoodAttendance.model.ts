import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel } from './base.model.js'
import type { Resident } from './resident.model.js'
import type { ResidentFamilyMember } from './residentFamilyMember.model.js'
import type { PropertyUnit } from './propertyUnit.model.js'
import type { FnbPropertyMealSlot } from './fnbPropertyMealSlot.model.js'
import type { User } from './user.model.js'

export interface FnbFoodAttendanceAttributes extends BaseAttributes {
  locId: string
  unitId?: string | null
  date: Date | string
  residentId?: string | null
  familyMemberId?: string | null
  isGuest: boolean
  guestName?: string | null
  guestCount: number
  mealSlotId: string
  status: 'attended' | 'absent' | 'opted_out'
  remarks?: string | null
}

export type FnbFoodAttendanceCreationAttributes = Optional<
  FnbFoodAttendanceAttributes,
  | 'id'
  | 'unitId'
  | 'residentId'
  | 'familyMemberId'
  | 'isGuest'
  | 'guestName'
  | 'guestCount'
  | 'status'
  | 'remarks'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class FnbFoodAttendance
  extends BaseModel<FnbFoodAttendanceAttributes, FnbFoodAttendanceCreationAttributes>
  implements FnbFoodAttendanceAttributes
{
  declare locId: string
  declare unitId: string | null
  declare date: Date | string
  declare residentId: string | null
  declare familyMemberId: string | null
  declare isGuest: boolean
  declare guestName: string | null
  declare guestCount: number
  declare mealSlotId: string
  declare status: 'attended' | 'absent' | 'opted_out'
  declare remarks: string | null

  declare resident?: Resident
  declare familyMember?: ResidentFamilyMember
  declare unit?: PropertyUnit
  declare mealSlot?: FnbPropertyMealSlot
  declare creator?: User
}

FnbFoodAttendance.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    locId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'loc_id',
    },
    unitId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'unit_id',
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    residentId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'resident_id',
    },
    familyMemberId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'family_member_id',
    },
    isGuest: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_guest',
    },
    guestName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'guest_name',
    },
    guestCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: 'guest_count',
    },
    mealSlotId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'meal_slot_id',
    },
    status: {
      type: DataTypes.ENUM('attended', 'absent', 'opted_out'),
      allowNull: false,
      defaultValue: 'attended',
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdBy: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      field: 'created_by',
    },
    updatedBy: {
      type: DataTypes.CHAR(36),
      allowNull: true,
      field: 'updated_by',
    },
  },
  {
    sequelize,
    tableName: 'fnb_food_attendances',
    timestamps: true,
    underscored: true,
  },
)

export default FnbFoodAttendance
