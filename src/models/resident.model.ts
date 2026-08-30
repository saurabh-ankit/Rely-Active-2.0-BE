import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { Gender, OwnershipType, ResidentStatus, ResidentType } from '../enums/resident.enum.js'

import { PropertyUnit } from './propertyUnit.model.js'
import { ResidentFamilyMember } from './residentFamilyMember.model.js'

export interface ResidentAttributes extends BaseAttributes {
  unitId: string
  locId: string
  companyId?: string | null
  residentType: ResidentType
  ownershipType?: OwnershipType | null
  isResiding: boolean
  firstName: string
  lastName?: string | null
  gender?: Gender | null
  dob?: Date | string | null
  username?: string | null
  passwordHash?: string | null
  email?: string | null
  phone?: string | null
  emergencyContact?: string | null
  bloodGroup?: string | null
  photoUrl?: string | null
  moveInDate?: Date | string | null
  moveOutDate?: Date | string | null
  status: ResidentStatus
  isActive?: boolean
  isDeleted?: boolean
}

export type ResidentCreationAttributes = Optional<
  ResidentAttributes,
  | 'id'
  | 'companyId'
  | 'ownershipType'
  | 'isResiding'
  | 'lastName'
  | 'gender'
  | 'dob'
  | 'username'
  | 'passwordHash'
  | 'email'
  | 'phone'
  | 'emergencyContact'
  | 'bloodGroup'
  | 'photoUrl'
  | 'moveInDate'
  | 'moveOutDate'
  | 'status'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class Resident extends BaseModel<ResidentAttributes, ResidentCreationAttributes> implements ResidentAttributes {
  declare unitId: string
  declare locId: string
  declare companyId: string | null
  declare unit?: PropertyUnit
  declare familyMembers?: ResidentFamilyMember[]
  declare residentType: ResidentType
  declare ownershipType: OwnershipType | null
  declare isResiding: boolean
  declare firstName: string
  declare lastName: string | null
  declare gender: Gender | null
  declare dob: Date | string | null
  declare username: string | null
  declare passwordHash: string | null
  declare email: string | null
  declare phone: string | null
  declare emergencyContact: string | null
  declare bloodGroup: string | null
  declare photoUrl: string | null
  declare moveInDate: Date | string | null
  declare moveOutDate: Date | string | null
  declare status: ResidentStatus
  declare isActive: boolean
  declare isDeleted: boolean
}

Resident.init(
  {
    ...baseModelColumns,
    unitId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> property_units.id',
    },
    locId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> properties.id (Property Location)',
    },
    companyId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    residentType: {
      type: DataTypes.ENUM('OWNER', 'TENANT'),
      allowNull: false,
    },
    ownershipType: {
      type: DataTypes.ENUM('PRIMARY', 'CO_OWNER', 'DEPENDENT'),
      allowNull: true,
      defaultValue: 'PRIMARY',
    },
    isResiding: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    gender: {
      type: DataTypes.ENUM('MALE', 'FEMALE', 'OTHER'),
      allowNull: true,
    },
    dob: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    username: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    emergencyContact: {
      type: DataTypes.STRING(30),
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
    moveInDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    moveOutDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'ACTIVE', 'INACTIVE', 'MOVED_OUT'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'residents',
    timestamps: true,
  },
)

export default Resident
