import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface RosterSettingAttributes extends BaseAttributes {
  companyId: string
  locationId: string
  preShiftBufferMinutes?: number
  postShiftBufferMinutes?: number
  minRestPeriodHours?: number
  maxWeeklyHours?: number
  minMultiPropertyTravelMinutes?: number
  isDeleted?: boolean
}

export type RosterSettingCreationAttributes = Optional<
  RosterSettingAttributes,
  | 'id'
  | 'preShiftBufferMinutes'
  | 'postShiftBufferMinutes'
  | 'minRestPeriodHours'
  | 'maxWeeklyHours'
  | 'minMultiPropertyTravelMinutes'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class RosterSetting
  extends BaseModel<RosterSettingAttributes, RosterSettingCreationAttributes>
  implements RosterSettingAttributes
{
  declare companyId: string
  declare locationId: string
  declare preShiftBufferMinutes: number
  declare postShiftBufferMinutes: number
  declare minRestPeriodHours: number
  declare maxWeeklyHours: number
  declare minMultiPropertyTravelMinutes: number
  declare isDeleted: boolean
}

RosterSetting.init(
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
    preShiftBufferMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 60,
    },
    postShiftBufferMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 120,
    },
    minRestPeriodHours: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 11,
    },
    maxWeeklyHours: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 48,
    },
    minMultiPropertyTravelMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 60,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'roster_settings',
    timestamps: true,
  },
)

export default RosterSetting
