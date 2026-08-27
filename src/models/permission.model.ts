import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'

export interface PermissionAttributes {
  id: string
  module_id: string
  name: string
  code: string
  action: string
  description?: string | null
  isActive?: boolean
  createdAt?: Date
  updatedAt?: Date
}

export type PermissionCreationAttributes = Optional<
  PermissionAttributes,
  'id' | 'description' | 'isActive' | 'createdAt' | 'updatedAt'
>

export class Permission
  extends Model<PermissionAttributes, PermissionCreationAttributes>
  implements PermissionAttributes
{
  declare id: string
  declare module_id: string
  declare name: string
  declare code: string
  declare action: string
  declare description: string | null
  declare isActive: boolean
  declare readonly createdAt: Date
  declare readonly updatedAt: Date
}

Permission.init(
  {
    id: {
      type: DataTypes.CHAR(36),
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    module_id: {
      type: DataTypes.CHAR(36),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'permissions',
    timestamps: true,
  },
)

export default Permission
