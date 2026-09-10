import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { ShiftEmployeeDateStatus, type LeaveType } from '../enums/roster.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface ShiftDateAttributes extends BaseAttributes {
  employeeShiftAssignmentId: string
  date: string
  status: ShiftEmployeeDateStatus
  coveredByEmployeeId?: string | null
  markedBy?: string | null
  markedAt?: Date | null
  notes?: string | null
  leaveType?: LeaveType | null
  leaveNote?: string | null
  locationId: string
  areaId?: string | null
  isActive: boolean
  isDeleted: boolean
}

export type ShiftDateCreationAttributes = Optional<
  ShiftDateAttributes,
  | 'id'
  | 'status'
  | 'coveredByEmployeeId'
  | 'markedBy'
  | 'markedAt'
  | 'notes'
  | 'leaveType'
  | 'leaveNote'
  | 'areaId'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class ShiftDate
  extends BaseModel<ShiftDateAttributes, ShiftDateCreationAttributes>
  implements ShiftDateAttributes
{
  declare employeeShiftAssignmentId: string
  declare date: string
  declare status: ShiftEmployeeDateStatus
  declare coveredByEmployeeId: string | null
  declare markedBy: string | null
  declare markedAt: Date | null
  declare notes: string | null
  declare leaveType: LeaveType | null
  declare leaveNote: string | null
  declare locationId: string
  declare areaId: string | null
  declare isActive: boolean
  declare isDeleted: boolean
}

ShiftDate.init(
  {
    ...baseModelColumns,
    employeeShiftAssignmentId: { type: DataTypes.UUID, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    status: {
      type: DataTypes.ENUM(...Object.values(ShiftEmployeeDateStatus)),
      allowNull: false,
      defaultValue: ShiftEmployeeDateStatus.UPCOMING,
    },
    coveredByEmployeeId: { type: DataTypes.UUID, allowNull: true },
    markedBy: { type: DataTypes.UUID, allowNull: true },
    markedAt: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    leaveType: { type: DataTypes.STRING(50), allowNull: true },
    leaveNote: { type: DataTypes.TEXT, allowNull: true },
    locationId: { type: DataTypes.UUID, allowNull: false },
    areaId: { type: DataTypes.UUID, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, tableName: 'shift_dates', timestamps: true },
)

/** @deprecated Use ShiftDate */
export { ShiftDate as ShiftEmployeeDate }
export type {
  ShiftDateAttributes as ShiftEmployeeDateAttributes,
  ShiftDateCreationAttributes as ShiftEmployeeDateCreationAttributes,
}

export default ShiftDate
