import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export type ShiftSlotMode = 'AUTO_GENERATE' | 'MANUAL'
export type ShiftStatus = 'ACTIVE' | 'INACTIVE'
export type ShiftCategory = 'GENERAL' | 'DEPARTMENT' | 'OPD'

export interface RosterShiftAttributes extends BaseAttributes {
  companyId: string
  locationId: string
  departmentId?: string | null
  shiftCategory?: ShiftCategory
  shiftName: string
  code: string
  description?: string | null
  startTime: string
  endTime: string
  breakStartTime?: string | null
  breakEndTime?: string | null
  slotGenerationMode?: ShiftSlotMode
  slotDurationMinutes?: number
  numberOfSlots?: number | null
  status?: ShiftStatus
  isDeleted?: boolean
}

export type RosterShiftCreationAttributes = Optional<
  RosterShiftAttributes,
  | 'id'
  | 'description'
  | 'departmentId'
  | 'shiftCategory'
  | 'breakStartTime'
  | 'breakEndTime'
  | 'departmentId'
  | 'shiftCategory'
  | 'slotGenerationMode'
  | 'slotDurationMinutes'
  | 'numberOfSlots'
  | 'status'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class RosterShift
  extends BaseModel<RosterShiftAttributes, RosterShiftCreationAttributes>
  implements RosterShiftAttributes
{
  declare companyId: string
  declare locationId: string
  declare departmentId: string | null
  declare shiftCategory: ShiftCategory
  declare shiftName: string
  declare code: string
  declare description: string | null
  declare startTime: string
  declare endTime: string
  declare breakStartTime: string | null
  declare breakEndTime: string | null
  declare slotGenerationMode: ShiftSlotMode
  declare slotDurationMinutes: number
  declare numberOfSlots: number | null
  declare status: ShiftStatus
  declare isDeleted: boolean
}

RosterShift.init(
  {
    ...baseModelColumns,
    companyId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    departmentId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    shiftCategory: {
      type: DataTypes.ENUM('GENERAL', 'DEPARTMENT', 'OPD'),
      allowNull: false,
      defaultValue: 'GENERAL',
    },
    shiftName: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    startTime: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    endTime: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    breakStartTime: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    breakEndTime: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    slotGenerationMode: {
      type: DataTypes.ENUM('AUTO_GENERATE', 'MANUAL'),
      allowNull: false,
      defaultValue: 'AUTO_GENERATE',
    },
    slotDurationMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 60,
    },
    numberOfSlots: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
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
    tableName: 'roster_shifts',
    timestamps: true,
  },
)

export default RosterShift
