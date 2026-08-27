import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'

export interface ResourceAttributes {
  id: string
  key: string
  name: string
  description?: string | null
  type?: string | null
  path?: string | null
  isActive?: boolean
  isDeleted?: boolean
  createdBy?: string | null
  updatedBy?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export type ResourceCreationAttributes = Optional<
  ResourceAttributes,
  | 'id'
  | 'description'
  | 'type'
  | 'path'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class Resource extends Model<ResourceAttributes, ResourceCreationAttributes> implements ResourceAttributes {
  declare id: string
  declare key: string
  declare name: string
  declare description: string | null
  declare type: string | null
  declare path: string | null
  declare isActive: boolean
  declare isDeleted: boolean
  declare createdBy: string | null
  declare updatedBy: string | null
  declare readonly createdAt: Date
  declare readonly updatedAt: Date
}

Resource.init(
  {
    id: {
      type: DataTypes.CHAR(36),
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    key: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    type: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    path: {
      type: DataTypes.STRING(255),
      allowNull: true,
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
    tableName: 'resources',
    timestamps: true,
  },
)

export default Resource
