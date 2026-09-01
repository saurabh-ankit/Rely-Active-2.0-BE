import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export type FrequencyType = 'ONCE' | 'DAILY' | 'WEEKLY' | 'BI_WEEKLY' | 'MONTHLY' | 'CUSTOM'
export type TimeUnit = 'DAYS' | 'WEEKS' | 'MONTHS'
export type FrequencyStatus = 'ACTIVE' | 'INACTIVE'

export interface RosterFrequencyAttributes extends BaseAttributes {
  companyId: string
  locationId: string
  frequencyName: string
  frequencyType?: FrequencyType
  interval?: number
  timeUnit?: TimeUnit
  allowedDaysOfWeek?: string[] | null
  monthlyDays?: number[] | null
  status?: FrequencyStatus
  description?: string | null
  isDeleted?: boolean
}

export type RosterFrequencyCreationAttributes = Optional<
  RosterFrequencyAttributes,
  | 'id'
  | 'frequencyType'
  | 'interval'
  | 'timeUnit'
  | 'allowedDaysOfWeek'
  | 'monthlyDays'
  | 'status'
  | 'description'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class RosterFrequency
  extends BaseModel<RosterFrequencyAttributes, RosterFrequencyCreationAttributes>
  implements RosterFrequencyAttributes
{
  declare companyId: string
  declare locationId: string
  declare frequencyName: string
  declare frequencyType: FrequencyType
  declare interval: number
  declare timeUnit: TimeUnit
  declare allowedDaysOfWeek: string[] | null
  declare monthlyDays: number[] | null
  declare status: FrequencyStatus
  declare description: string | null
  declare isDeleted: boolean
}

RosterFrequency.init(
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
    frequencyName: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    frequencyType: {
      type: DataTypes.ENUM('ONCE', 'DAILY', 'WEEKLY', 'BI_WEEKLY', 'MONTHLY', 'CUSTOM'),
      allowNull: false,
      defaultValue: 'WEEKLY',
    },
    interval: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    timeUnit: {
      type: DataTypes.ENUM('DAYS', 'WEEKS', 'MONTHS'),
      allowNull: false,
      defaultValue: 'WEEKS',
    },
    allowedDaysOfWeek: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    monthlyDays: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'roster_frequencies',
    timestamps: true,
  },
)

export default RosterFrequency
