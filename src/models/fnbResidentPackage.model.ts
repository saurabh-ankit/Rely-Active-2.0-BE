import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { FnbDietaryType, FnbSubscriptionStatus } from '../enums/fnb.enum.js'
import type { FnbPropertyPackage } from './fnbPropertyPackage.model.js'
import type { Resident } from './resident.model.js'
import type { ResidentFamilyMember } from './residentFamilyMember.model.js'

export interface FnbResidentPackageAttributes extends BaseAttributes {
  residentId?: string | null
  familyMemberId?: string | null
  propertyPackageId: string
  startDate: Date | string
  endDate?: Date | string | null
  dietaryPreference?: FnbDietaryType
  allergiesNotes?: string | null
  status: FnbSubscriptionStatus
}

export type FnbResidentPackageCreationAttributes = Optional<
  FnbResidentPackageAttributes,
  | 'id'
  | 'residentId'
  | 'familyMemberId'
  | 'endDate'
  | 'dietaryPreference'
  | 'allergiesNotes'
  | 'status'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class FnbResidentPackage
  extends BaseModel<FnbResidentPackageAttributes, FnbResidentPackageCreationAttributes>
  implements FnbResidentPackageAttributes
{
  declare residentId: string | null
  declare familyMemberId: string | null
  declare propertyPackageId: string
  declare startDate: Date | string
  declare endDate: Date | string | null
  declare dietaryPreference: FnbDietaryType
  declare allergiesNotes: string | null
  declare status: FnbSubscriptionStatus

  declare resident?: Resident
  declare familyMember?: ResidentFamilyMember
  declare propertyPackage?: FnbPropertyPackage
}

FnbResidentPackage.init(
  {
    ...baseModelColumns,
    residentId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    familyMemberId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    propertyPackageId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    dietaryPreference: {
      type: DataTypes.ENUM('veg', 'non_veg', 'egg', 'jain', 'vegan'),
      allowNull: true,
      defaultValue: FnbDietaryType.VEG,
    },
    allergiesNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('active', 'paused', 'cancelled', 'completed'),
      allowNull: false,
      defaultValue: FnbSubscriptionStatus.ACTIVE,
    },
  },
  {
    sequelize,
    tableName: 'fnb_resident_packages',
    timestamps: true,
  },
)

export default FnbResidentPackage
