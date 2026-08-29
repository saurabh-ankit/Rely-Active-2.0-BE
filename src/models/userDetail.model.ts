import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface UserDetailAttributes extends BaseAttributes {
  userId: string
  firstName: string
  lastName?: string | null
  phone?: string | null
  gender?: string | null
  dateOfBirth?: string | null
  dateOfJoining?: string | null
  photoUrl?: string | null
  employeeCode?: string | null
  emergencyContact?: string | null
  bloodGroup?: string | null
  address?: string | null
  qualification?: string | null
  experience?: string | null
}

export type UserDetailCreationAttributes = Optional<
  UserDetailAttributes,
  | 'id'
  | 'lastName'
  | 'phone'
  | 'gender'
  | 'dateOfBirth'
  | 'dateOfJoining'
  | 'photoUrl'
  | 'employeeCode'
  | 'emergencyContact'
  | 'bloodGroup'
  | 'address'
  | 'qualification'
  | 'experience'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class UserDetail
  extends BaseModel<UserDetailAttributes, UserDetailCreationAttributes>
  implements UserDetailAttributes
{
  declare userId: string
  declare firstName: string
  declare lastName: string | null
  declare phone: string | null
  declare gender: string | null
  declare dateOfBirth: string | null
  declare dateOfJoining: string | null
  declare photoUrl: string | null
  declare employeeCode: string | null
  declare emergencyContact: string | null
  declare bloodGroup: string | null
  declare address: string | null
  declare qualification: string | null
  declare experience: string | null
}

UserDetail.init(
  {
    ...baseModelColumns,
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    gender: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    dateOfBirth: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    dateOfJoining: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    photoUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    employeeCode: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    emergencyContact: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    bloodGroup: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    qualification: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    experience: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'user_details',
    timestamps: true,
  },
)

export default UserDetail
