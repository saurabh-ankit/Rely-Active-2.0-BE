import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'

export interface RoleAttributes {
  id: string
  name: string
  code: string
  description?: string | null
  is_system?: boolean
  isActive?: boolean
  createdAt?: Date
  updatedAt?: Date
}

export type RoleCreationAttributes = Optional<
  RoleAttributes,
  'id' | 'description' | 'is_system' | 'isActive' | 'createdAt' | 'updatedAt'
>

export class Role extends Model<RoleAttributes, RoleCreationAttributes> implements RoleAttributes {
  declare id: string
  declare name: string
  declare code: string
  declare description: string | null
  declare is_system: boolean
  declare isActive: boolean
  declare readonly createdAt: Date
  declare readonly updatedAt: Date
}

Role.init(
  {
    id: {
      type: DataTypes.CHAR(36),
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    is_system: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'roles',
    timestamps: true,
  },
)

export default Role
