import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import type { WeekDay } from '../enums/roster.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface ShiftAssignmentAttributes extends BaseAttributes {
  employeeId: string
  shiftId: string
  locationId: string
  startDate: string
  endDate: string
  notes?: string | null
  workingDays?: WeekDay[] | null
  areaId?: string | null
  unitId?: string | null
  blockId?: string | null
  floorId?: string | null
  slotTimeRange?: string | null
  isActive: boolean
  isDeleted: boolean
}

export type ShiftAssignmentCreationAttributes = Optional<
  ShiftAssignmentAttributes,
  | 'id'
  | 'notes'
  | 'workingDays'
  | 'areaId'
  | 'unitId'
  | 'blockId'
  | 'floorId'
  | 'slotTimeRange'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class ShiftAssignment
  extends BaseModel<ShiftAssignmentAttributes, ShiftAssignmentCreationAttributes>
  implements ShiftAssignmentAttributes
{
  declare employeeId: string
  declare shiftId: string
  declare locationId: string
  declare startDate: string
  declare endDate: string
  declare notes: string | null
  declare workingDays: WeekDay[] | null
  declare areaId: string | null
  declare unitId: string | null
  declare blockId: string | null
  declare floorId: string | null
  declare slotTimeRange: string | null
  declare isActive: boolean
  declare isDeleted: boolean

  isWorkingOn(date: Date | string): boolean {
    if (!this.workingDays || this.workingDays.length === 0) return true
    const d = typeof date === 'string' ? new Date(date) : date
    const dayNames: WeekDay[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const dayName = dayNames[d.getDay()]
    return dayName ? this.workingDays.includes(dayName) : true
  }
}

ShiftAssignment.init(
  {
    ...baseModelColumns,
    employeeId: { type: DataTypes.UUID, allowNull: false },
    shiftId: { type: DataTypes.UUID, allowNull: false },
    locationId: { type: DataTypes.UUID, allowNull: false },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    notes: { type: DataTypes.STRING(500), allowNull: true },
    workingDays: { type: DataTypes.JSON, allowNull: true },
    areaId: { type: DataTypes.UUID, allowNull: true },
    unitId: { type: DataTypes.UUID, allowNull: true },
    blockId: { type: DataTypes.UUID, allowNull: true },
    floorId: { type: DataTypes.UUID, allowNull: true },
    slotTimeRange: { type: DataTypes.STRING(20), allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, tableName: 'shift_assignments', timestamps: true },
)

/** @deprecated Use ShiftAssignment */
export { ShiftAssignment as EmployeeShiftAssignmentV2 }
export type {
  ShiftAssignmentAttributes as EmployeeShiftAssignmentV2Attributes,
  ShiftAssignmentCreationAttributes as EmployeeShiftAssignmentV2CreationAttributes,
}

export default ShiftAssignment
