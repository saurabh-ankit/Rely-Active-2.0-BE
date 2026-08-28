import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface UserLocationPermissionAttributes extends BaseAttributes {
  userId: string
  locationId: string
  resourceKey: string
  permission: 'view' | 'create' | 'update' | 'delete'
  isActive?: boolean
  isDeleted?: boolean
}

export type UserLocationPermissionCreationAttributes = Optional<
  UserLocationPermissionAttributes,
  'id' | 'isActive' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class UserLocationPermission
  extends BaseModel<UserLocationPermissionAttributes, UserLocationPermissionCreationAttributes>
  implements UserLocationPermissionAttributes
{
  declare userId: string
  declare locationId: string
  declare resourceKey: string
  declare permission: 'view' | 'create' | 'update' | 'delete'
  declare isActive: boolean
  declare isDeleted: boolean
}

UserLocationPermission.init(
  {
    ...baseModelColumns,
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
  },
  {
    sequelize,
    tableName: 'user_location_permissions',
    timestamps: true,
  },
)

export default UserLocationPermission
