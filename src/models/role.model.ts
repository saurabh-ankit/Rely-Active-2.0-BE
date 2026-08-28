import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface RoleAttributes extends BaseAttributes {
  name: string
  code: string
  description?: string | null
  isSystem?: boolean
  isActive?: boolean
}

export type RoleCreationAttributes = Optional<
  RoleAttributes,
  'id' | 'description' | 'isSystem' | 'isActive' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class Role extends BaseModel<RoleAttributes, RoleCreationAttributes> implements RoleAttributes {
  declare name: string
  declare code: string
  declare description: string | null
  declare isSystem: boolean
  declare isActive: boolean
}

Role.init(
  {
    ...baseModelColumns,
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
    isSystem: {
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
