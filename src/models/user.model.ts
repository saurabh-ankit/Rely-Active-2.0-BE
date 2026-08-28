import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export type UserStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'BLOCKED'

export interface UserAttributes extends BaseAttributes {
  username?: string | null
  companyId?: string | null
  defaultLocationId?: string | null
  email?: string | null
  phone?: string | null
  passwordHash?: string | null
  status: UserStatus
  isActive?: boolean
  isDeleted?: boolean
}

export type UserCreationAttributes = Optional<
  UserAttributes,
  | 'id'
  | 'username'
  | 'companyId'
  | 'defaultLocationId'
  | 'email'
  | 'phone'
  | 'passwordHash'
  | 'status'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class User extends BaseModel<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare username: string | null
  declare companyId: string | null
  declare defaultLocationId: string | null
  declare email: string | null
  declare phone: string | null
  declare passwordHash: string | null
  declare status: UserStatus
  declare isActive: boolean
  declare isDeleted: boolean
}

User.init(
  {
    ...baseModelColumns,
    username: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
    },
    companyId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    defaultLocationId: {
      type: DataTypes.UUID,
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
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'ACTIVE', 'INACTIVE', 'BLOCKED'),
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
    tableName: 'users',
    timestamps: true,
  },
)

export default User
