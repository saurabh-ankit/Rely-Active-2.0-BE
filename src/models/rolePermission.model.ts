import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'

export interface RolePermissionAttributes {
  role_id: string
  permission_id: string
  createdAt?: Date
}

export type RolePermissionCreationAttributes = Optional<RolePermissionAttributes, 'createdAt'>

export class RolePermission
  extends Model<RolePermissionAttributes, RolePermissionCreationAttributes>
  implements RolePermissionAttributes
{
  declare role_id: string
  declare permission_id: string
  declare readonly createdAt: Date
}

RolePermission.init(
  {
    role_id: {
      type: DataTypes.CHAR(36),
      allowNull: false,
      primaryKey: true,
    },
    permission_id: {
      type: DataTypes.CHAR(36),
      allowNull: false,
      primaryKey: true,
    },
  },
  {
    sequelize,
    tableName: 'role_permissions',
    timestamps: true,
    updatedAt: false,
  },
)

export default RolePermission
