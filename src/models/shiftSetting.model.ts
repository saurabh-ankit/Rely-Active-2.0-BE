import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface ShiftSettingAttributes extends BaseAttributes {
  locationId: string
  preShiftBufferMinutes: number
  postShiftBufferMinutes: number
}

export type ShiftSettingCreationAttributes = Optional<
  ShiftSettingAttributes,
  'id' | 'preShiftBufferMinutes' | 'postShiftBufferMinutes' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class ShiftSetting
  extends BaseModel<ShiftSettingAttributes, ShiftSettingCreationAttributes>
  implements ShiftSettingAttributes
{
  declare locationId: string
  declare preShiftBufferMinutes: number
  declare postShiftBufferMinutes: number
}

ShiftSetting.init(
  {
    ...baseModelColumns,
    locationId: { type: DataTypes.UUID, allowNull: false },
    preShiftBufferMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 },
    postShiftBufferMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 120 },
  },
  { sequelize, tableName: 'shift_settings', timestamps: true },
)

/** @deprecated Use ShiftSetting */
export { ShiftSetting as RosterSetting }
export type {
  ShiftSettingAttributes as RosterSettingAttributes,
  ShiftSettingCreationAttributes as RosterSettingCreationAttributes,
}

export default ShiftSetting
