import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'

export interface ModuleAttributes {
  id: string
  parent_id?: string | null
  name: string
  code: string
  description?: string | null
  icon?: string | null
  sort_order?: number
  isActive?: boolean
  createdAt?: Date
  updatedAt?: Date
}

export type ModuleCreationAttributes = Optional<
  ModuleAttributes,
  'id' | 'parent_id' | 'description' | 'icon' | 'sort_order' | 'isActive' | 'createdAt' | 'updatedAt'
>

export class Module extends Model<ModuleAttributes, ModuleCreationAttributes> implements ModuleAttributes {
  declare id: string
  declare parent_id: string | null
  declare name: string
  declare code: string
  declare description: string | null
  declare icon: string | null
  declare sort_order: number
  declare isActive: boolean
  declare readonly createdAt: Date
  declare readonly updatedAt: Date
}

Module.init(
  {
    id: {
      type: DataTypes.CHAR(36),
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    parent_id: {
      type: DataTypes.CHAR(36),
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING(150),
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
    icon: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    sort_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'modules',
    timestamps: true,
  },
)

export default Module
