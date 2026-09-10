import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface ShiftRolePolicyAttributes extends BaseAttributes {
  locationId: string
  role: string
  requiresShift: boolean
  preShiftBufferMinutes: number
  postShiftBufferMinutes: number
  allowCover: boolean
  allowSwap: boolean
  allowDayOff: boolean
}

export type ShiftRolePolicyCreationAttributes = Optional<
  ShiftRolePolicyAttributes,
  | 'id'
  | 'requiresShift'
  | 'preShiftBufferMinutes'
  | 'postShiftBufferMinutes'
  | 'allowCover'
  | 'allowSwap'
  | 'allowDayOff'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class ShiftRolePolicy
  extends BaseModel<ShiftRolePolicyAttributes, ShiftRolePolicyCreationAttributes>
  implements ShiftRolePolicyAttributes
{
  declare locationId: string
  declare role: string
  declare requiresShift: boolean
  declare preShiftBufferMinutes: number
  declare postShiftBufferMinutes: number
  declare allowCover: boolean
  declare allowSwap: boolean
  declare allowDayOff: boolean
}

ShiftRolePolicy.init(
  {
    ...baseModelColumns,
    locationId: { type: DataTypes.UUID, allowNull: false },
    role: { type: DataTypes.STRING(50), allowNull: false },
    requiresShift: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    preShiftBufferMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 },
    postShiftBufferMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 120 },
    allowCover: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    allowSwap: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    allowDayOff: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { sequelize, tableName: 'shift_role_policies', timestamps: true },
)

/** @deprecated Use ShiftRolePolicy */
export { ShiftRolePolicy as RosterRolePolicy }
export type {
  ShiftRolePolicyAttributes as RosterRolePolicyAttributes,
  ShiftRolePolicyCreationAttributes as RosterRolePolicyCreationAttributes,
}

export default ShiftRolePolicy
