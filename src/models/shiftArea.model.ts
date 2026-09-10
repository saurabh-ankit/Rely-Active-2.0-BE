import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { RosterAreaStatus, RosterAreaType } from '../enums/roster.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface ShiftAreaAttributes extends BaseAttributes {
  areaName: string
  areaType: RosterAreaType
  location: string
  capacity?: string | null
  status: RosterAreaStatus
  description?: string | null
  locationId: string
  isDeleted: boolean
}

export type ShiftAreaCreationAttributes = Optional<
  ShiftAreaAttributes,
  'id' | 'capacity' | 'status' | 'description' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class ShiftArea
  extends BaseModel<ShiftAreaAttributes, ShiftAreaCreationAttributes>
  implements ShiftAreaAttributes
{
  declare areaName: string
  declare areaType: RosterAreaType
  declare location: string
  declare capacity: string | null
  declare status: RosterAreaStatus
  declare description: string | null
  declare locationId: string
  declare isDeleted: boolean
}

ShiftArea.init(
  {
    ...baseModelColumns,
    areaName: { type: DataTypes.STRING(255), allowNull: false },
    areaType: {
      type: DataTypes.ENUM(...Object.values(RosterAreaType)),
      allowNull: false,
    },
    location: { type: DataTypes.STRING(255), allowNull: false },
    capacity: { type: DataTypes.STRING(100), allowNull: true },
    status: {
      type: DataTypes.ENUM(...Object.values(RosterAreaStatus)),
      allowNull: false,
      defaultValue: RosterAreaStatus.ACTIVE,
    },
    description: { type: DataTypes.TEXT, allowNull: true },
    locationId: { type: DataTypes.UUID, allowNull: false },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, tableName: 'shift_areas', timestamps: true },
)

/** @deprecated Use ShiftArea */
export { ShiftArea as RosterArea }
export type { ShiftAreaAttributes as RosterAreaAttributes, ShiftAreaCreationAttributes as RosterAreaCreationAttributes }

export default ShiftArea
