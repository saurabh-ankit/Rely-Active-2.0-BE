import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'

export interface UserRoleAttributes {
  id: string
  user_id: string
  role_id: string
  company_id?: string | null
  location_id?: string | null
  department_id?: string | null
  assigned_by?: string | null
  valid_from?: Date | null
  valid_until?: Date | null
  isActive?: boolean
  createdAt?: Date
  updatedAt?: Date
}

export type UserRoleCreationAttributes = Optional<
  UserRoleAttributes,
  | 'id'
  | 'company_id'
  | 'location_id'
  | 'department_id'
  | 'assigned_by'
  | 'valid_from'
  | 'valid_until'
  | 'isActive'
  | 'createdAt'
  | 'updatedAt'
>

export class UserRole extends Model<UserRoleAttributes, UserRoleCreationAttributes> implements UserRoleAttributes {
  declare id: string
  declare user_id: string
  declare role_id: string
  declare company_id: string | null
  declare location_id: string | null
  declare department_id: string | null
  declare assigned_by: string | null
  declare valid_from: Date | null
  declare valid_until: Date | null
  declare isActive: boolean
  declare readonly createdAt: Date
  declare readonly updatedAt: Date
}

UserRole.init(
  {
    id: {
      type: DataTypes.CHAR(36),
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.CHAR(36),
      allowNull: false,
    },
    role_id: {
      type: DataTypes.CHAR(36),
      allowNull: false,
    },
    company_id: {
      type: DataTypes.CHAR(36),
      allowNull: true,
    },
    location_id: {
      type: DataTypes.CHAR(36),
      allowNull: true,
    },
    department_id: {
      type: DataTypes.CHAR(36),
      allowNull: true,
    },
    assigned_by: {
      type: DataTypes.CHAR(36),
      allowNull: true,
    },
    valid_from: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    valid_until: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'user_roles',
    timestamps: true,
  },
)

export default UserRole
