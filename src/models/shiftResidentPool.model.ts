import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface ShiftResidentPoolAttributes extends BaseAttributes {
  shiftEmployeeDateId: string
  residentId: string
  fromTime?: string | null
  toTime?: string | null
  notes?: string | null
  locationId: string
  isActive: boolean
  isDeleted: boolean
}

export type ShiftResidentPoolCreationAttributes = Optional<
  ShiftResidentPoolAttributes,
  | 'id'
  | 'fromTime'
  | 'toTime'
  | 'notes'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class ShiftResidentPool
  extends BaseModel<ShiftResidentPoolAttributes, ShiftResidentPoolCreationAttributes>
  implements ShiftResidentPoolAttributes
{
  declare shiftEmployeeDateId: string
  declare residentId: string
  declare fromTime: string | null
  declare toTime: string | null
  declare notes: string | null
  declare locationId: string
  declare isActive: boolean
  declare isDeleted: boolean
}

ShiftResidentPool.init(
  {
    ...baseModelColumns,
    shiftEmployeeDateId: { type: DataTypes.UUID, allowNull: false },
    residentId: { type: DataTypes.UUID, allowNull: false },
    fromTime: { type: DataTypes.STRING(5), allowNull: true },
    toTime: { type: DataTypes.STRING(5), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    locationId: { type: DataTypes.UUID, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, tableName: 'shift_resident_pools', timestamps: true },
)

export default ShiftResidentPool
