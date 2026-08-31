import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { Gender } from '../enums/resident.enum.js'
import type { Resident } from './resident.model.js'
import type { FnbResidentPackage } from './fnbResidentPackage.model.js'

export interface ResidentFamilyMemberAttributes extends BaseAttributes {
  residentId: string
  firstName: string
  lastName?: string | null
  relation: string
  isResiding?: boolean
  gender?: Gender | null
  dob?: Date | string | null
  bloodGroup?: string | null
  photoUrl?: string | null
  phone?: string | null
  username?: string | null
  passwordHash?: string | null
  email?: string | null
  isDeleted?: boolean
}

export type ResidentFamilyMemberCreationAttributes = Optional<
  ResidentFamilyMemberAttributes,
  | 'id'
  | 'lastName'
  | 'isResiding'
  | 'gender'
  | 'dob'
  | 'bloodGroup'
  | 'photoUrl'
  | 'phone'
  | 'username'
  | 'passwordHash'
  | 'email'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class ResidentFamilyMember
  extends BaseModel<ResidentFamilyMemberAttributes, ResidentFamilyMemberCreationAttributes>
  implements ResidentFamilyMemberAttributes
{
  declare residentId: string
  declare resident?: Resident
  declare fnbPackages?: FnbResidentPackage[]
  declare firstName: string
  declare lastName: string | null
  declare relation: string
  declare isResiding: boolean
  declare gender: Gender | null
  declare dob: Date | string | null
  declare bloodGroup: string | null
  declare photoUrl: string | null
  declare phone: string | null
  declare username: string | null
  declare passwordHash: string | null
  declare email: string | null
  declare isDeleted: boolean
}

ResidentFamilyMember.init(
  {
    ...baseModelColumns,
    residentId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> residents.id',
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    relation: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    isResiding: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    gender: {
      type: DataTypes.ENUM('MALE', 'FEMALE', 'OTHER'),
      allowNull: true,
    },
    dob: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    bloodGroup: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    photoUrl: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true,
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'resident_family_members',
    timestamps: true,
  },
)

export default ResidentFamilyMember
