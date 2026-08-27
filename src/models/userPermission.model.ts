import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'

export type PermissionEffect = 'ALLOW' | 'DENY'

export interface UserPermissionAttributes {
  id: string
  user_id: string
  permission_id: string
  effect: PermissionEffect
  company_id?: string | null
  location_id?: string | null
  department_id?: string | null
  reason?: string | null
  assigned_by?: string | null
  valid_from?: Date | null
  valid_until?: Date | null
  isActive?: boolean
  createdAt?: Date
  updatedAt?: Date
}

export type UserPermissionCreationAttributes = Optional<
  UserPermissionAttributes,
  | 'id'
  | 'company_id'
  | 'location_id'
  | 'department_id'
  | 'reason'
  | 'assigned_by'
  | 'valid_from'
  | 'valid_until'
  | 'isActive'
  | 'createdAt'
  | 'updatedAt'
>

export class UserPermission
  extends Model<UserPermissionAttributes, UserPermissionCreationAttributes>
  implements UserPermissionAttributes
{
  declare id: string
  declare user_id: string
  declare permission_id: string
  declare effect: PermissionEffect
  declare company_id: string | null
  declare location_id: string | null
  declare department_id: string | null
  declare reason: string | null
  declare assigned_by: string | null
  declare valid_from: Date | null
  declare valid_until: Date | null
  declare isActive: boolean
  declare readonly createdAt: Date
  declare readonly updatedAt: Date
}

UserPermission.init(
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
    permission_id: {
      type: DataTypes.CHAR(36),
      allowNull: false,
    },
    effect: {
      type: DataTypes.ENUM('ALLOW', 'DENY'),
      allowNull: false,
      defaultValue: 'ALLOW',
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
    reason: {
      type: DataTypes.STRING(500),
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
    tableName: 'user_permissions',
    timestamps: true,
  },
)

export default UserPermission
