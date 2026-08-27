import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'

export interface UserLocationPermissionAttributes {
  id: string
  userId: string
  locationId: string
  resourceKey: string
  permission: 'view' | 'create' | 'update' | 'delete'
  isActive?: boolean
  isDeleted?: boolean
  createdBy?: string | null
  updatedBy?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export type UserLocationPermissionCreationAttributes = Optional<
  UserLocationPermissionAttributes,
  'id' | 'isActive' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class UserLocationPermission
  extends Model<UserLocationPermissionAttributes, UserLocationPermissionCreationAttributes>
  implements UserLocationPermissionAttributes
{
  declare id: string
  declare userId: string
  declare locationId: string
  declare resourceKey: string
  declare permission: 'view' | 'create' | 'update' | 'delete'
  declare isActive: boolean
  declare isDeleted: boolean
  declare createdBy: string | null
  declare updatedBy: string | null
  declare readonly createdAt: Date
  declare readonly updatedAt: Date
}

UserLocationPermission.init(
  {
    id: {
      type: DataTypes.CHAR(36),
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.CHAR(36),
      allowNull: false,
    },
    locationId: {
      type: DataTypes.CHAR(36),
      allowNull: false,
    },
    resourceKey: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    permission: {
      type: DataTypes.ENUM('view', 'create', 'update', 'delete'),
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    createdBy: {
      type: DataTypes.CHAR(36),
      allowNull: true,
    },
    updatedBy: {
      type: DataTypes.CHAR(36),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'user_location_permissions',
    timestamps: true,
  },
)

export default UserLocationPermission
