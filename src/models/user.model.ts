import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'

export type UserStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'BLOCKED'

export interface UserAttributes {
  id: string
  company_id?: string | null
  default_location_id?: string | null
  email?: string | null
  phone?: string | null
  password_hash?: string | null
  status: UserStatus
  isActive?: boolean
  isDeleted?: boolean
  createdAt?: Date
  updatedAt?: Date
}

export type UserCreationAttributes = Optional<
  UserAttributes,
  | 'id'
  | 'company_id'
  | 'default_location_id'
  | 'email'
  | 'phone'
  | 'password_hash'
  | 'status'
  | 'isActive'
  | 'isDeleted'
  | 'createdAt'
  | 'updatedAt'
>

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: string
  declare company_id: string | null
  declare default_location_id: string | null
  declare email: string | null
  declare phone: string | null
  declare password_hash: string | null
  declare status: UserStatus
  declare isActive: boolean
  declare isDeleted: boolean
  declare readonly createdAt: Date
  declare readonly updatedAt: Date
}

User.init(
  {
    id: {
      type: DataTypes.CHAR(36),
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    company_id: {
      type: DataTypes.CHAR(36),
      allowNull: true,
    },
    default_location_id: {
      type: DataTypes.CHAR(36),
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
    password_hash: {
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
