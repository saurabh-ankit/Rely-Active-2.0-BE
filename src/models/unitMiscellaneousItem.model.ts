import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

import type { PropertyUnit } from './propertyUnit.model.js'
import type { Resident } from './resident.model.js'

/** A charge logged against a flat before billing; picked up by the next invoice. */
export interface UnitMiscellaneousItemAttributes extends BaseAttributes {
  unitId: string
  residentId?: string | null
  propertyId: string
  name: string
  description?: string | null
  quantity: number
  price: number
  total: number
  serviceDate: string
  attachmentUrl?: string | null
  isDeleted?: boolean
}

export type UnitMiscellaneousItemCreationAttributes = Optional<
  UnitMiscellaneousItemAttributes,
  | 'id'
  | 'residentId'
  | 'description'
  | 'attachmentUrl'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class UnitMiscellaneousItem
  extends BaseModel<UnitMiscellaneousItemAttributes, UnitMiscellaneousItemCreationAttributes>
  implements UnitMiscellaneousItemAttributes
{
  declare unitId: string
  declare residentId: string | null
  declare propertyId: string
  declare name: string
  declare description: string | null
  declare quantity: number
  declare price: number
  declare total: number
  declare serviceDate: string
  declare attachmentUrl: string | null
  declare isDeleted: boolean

  declare unit?: PropertyUnit
  declare resident?: Resident
}

const num = (field: keyof UnitMiscellaneousItemAttributes, type: DataTypes.DataType) => ({
  type,
  allowNull: false,
  defaultValue: 0,
  get(this: UnitMiscellaneousItem) {
    return Number(this.getDataValue(field) ?? 0)
  },
})

UnitMiscellaneousItem.init(
  {
    ...baseModelColumns,
    unitId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> property_units.id' },
    residentId: { type: DataTypes.UUID, allowNull: true, comment: 'FK -> residents.id' },
    propertyId: { type: DataTypes.UUID, allowNull: false, comment: 'FK -> properties.id' },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    quantity: num('quantity', DataTypes.DECIMAL(12, 3)),
    price: num('price', DataTypes.DECIMAL(12, 2)),
    total: num('total', DataTypes.DECIMAL(12, 2)),
    serviceDate: { type: DataTypes.DATEONLY, allowNull: false },
    attachmentUrl: { type: DataTypes.STRING(1024), allowNull: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    tableName: 'unit_miscellaneous_items',
    timestamps: true,
  },
)

export default UnitMiscellaneousItem
