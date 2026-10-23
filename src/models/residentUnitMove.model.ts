import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { PropertyUnit } from './propertyUnit.model.js'

/** A resident moving from one flat to another; billing carries the old flat's unbilled charges over. */
export interface ResidentUnitMoveAttributes extends BaseAttributes {
  residentId: string
  fromUnitId: string
  toUnitId: string
  /** First day in the new flat (YYYY-MM-DD); charges before it were used in the old flat. */
  moveDate: string
  isDeleted?: boolean
}

export type ResidentUnitMoveCreationAttributes = Optional<
  ResidentUnitMoveAttributes,
  'id' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class ResidentUnitMove
  extends BaseModel<ResidentUnitMoveAttributes, ResidentUnitMoveCreationAttributes>
  implements ResidentUnitMoveAttributes
{
  declare residentId: string
  declare fromUnitId: string
  declare toUnitId: string
  declare moveDate: string
  declare isDeleted: boolean

  declare fromUnit?: PropertyUnit
  declare toUnit?: PropertyUnit
}

ResidentUnitMove.init(
  {
    ...baseModelColumns,
    residentId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> residents.id' },
    fromUnitId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> property_units.id (old flat)' },
    toUnitId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> property_units.id (new flat)' },
    moveDate: { type: DataTypes.DATEONLY, allowNull: false },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    tableName: 'resident_unit_moves',
    timestamps: true,
  },
)

export default ResidentUnitMove
