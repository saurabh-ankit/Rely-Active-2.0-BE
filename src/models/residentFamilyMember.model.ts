import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { Gender } from '../enums/resident.enum.js'
import type { Resident } from './resident.model.js'

export interface ResidentFamilyMemberAttributes extends BaseAttributes {
  residentId: string
  firstName: string
  lastName?: string | null
  relation: string
  gender?: Gender | null
  age?: number | null
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
  | 'gender'
  | 'age'
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
  declare firstName: string
  declare lastName: string | null
  declare relation: string
  declare gender: Gender | null
  declare age: number | null
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
    gender: {
      type: DataTypes.ENUM('MALE', 'FEMALE', 'OTHER'),
      allowNull: true,
    },
    age: {
      type: DataTypes.INTEGER,
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
