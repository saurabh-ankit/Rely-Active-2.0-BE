import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { UnitResidentRelationshipType } from '../enums/billing.enum.js'

import type { PropertyUnit } from './propertyUnit.model.js'
import type { Resident } from './resident.model.js'

export interface UnitResidentAttributes extends BaseAttributes {
  unitId: string
  residentId: string
  relationshipType: UnitResidentRelationshipType
  isPrimary: boolean
  startDate: Date | string
  endDate?: Date | string | null
  isActive?: boolean
}

export type UnitResidentCreationAttributes = Optional<
  UnitResidentAttributes,
  | 'id'
  | 'relationshipType'
  | 'isPrimary'
  | 'endDate'
  | 'isActive'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class UnitResident
  extends BaseModel<UnitResidentAttributes, UnitResidentCreationAttributes>
  implements UnitResidentAttributes
{
  declare unitId: string
  declare residentId: string
  declare relationshipType: UnitResidentRelationshipType
  declare isPrimary: boolean
  declare startDate: Date | string
  declare endDate: Date | string | null
  declare isActive: boolean

  // Associations
  declare unit?: PropertyUnit
  declare resident?: Resident
}

UnitResident.init(
  {
    ...baseModelColumns,
    unitId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> property_units.id',
    },
    residentId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> residents.id',
    },
    relationshipType: {
      type: DataTypes.ENUM('OWNER', 'TENANT', 'SPOUSE', 'DEPENDENT', 'CO_RESIDENT', 'CARETAKER'),
      allowNull: false,
      defaultValue: UnitResidentRelationshipType.OWNER,
    },
    isPrimary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Primary contact/occupant for this unit',
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: 'NULL = currently residing/owning',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'billing_unit_residents',
    timestamps: true,
  },
)

export default UnitResident
