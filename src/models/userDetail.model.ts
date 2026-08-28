import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface UserDetailAttributes extends BaseAttributes {
  userId: string
  firstName: string
  lastName?: string | null
  gender?: string | null
  dateOfBirth?: string | null
  photoUrl?: string | null
  designation?: string | null
  employeeCode?: string | null
  emergencyContact?: string | null
  bloodGroup?: string | null
}

export type UserDetailCreationAttributes = Optional<
  UserDetailAttributes,
  | 'id'
  | 'lastName'
  | 'gender'
  | 'dateOfBirth'
  | 'photoUrl'
  | 'designation'
  | 'employeeCode'
  | 'emergencyContact'
  | 'bloodGroup'
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
  declare gender: string | null
  declare dateOfBirth: string | null
  declare photoUrl: string | null
  declare designation: string | null
  declare employeeCode: string | null
  declare emergencyContact: string | null
  declare bloodGroup: string | null
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
    gender: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    dateOfBirth: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    photoUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    designation: {
      type: DataTypes.STRING(150),
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
  },
  {
    sequelize,
    tableName: 'user_details',
    timestamps: true,
  },
)

export default UserDetail
