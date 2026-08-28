import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface UserRoleAttributes extends BaseAttributes {
  userId: string
  roleId: string
  companyId?: string | null
  locationId?: string | null
  departmentId?: string | null
  assignedBy?: string | null
  validFrom?: Date | null
  validUntil?: Date | null
  isActive?: boolean
}

export type UserRoleCreationAttributes = Optional<
  UserRoleAttributes,
  | 'id'
  | 'companyId'
  | 'locationId'
  | 'departmentId'
  | 'assignedBy'
  | 'validFrom'
  | 'validUntil'
  | 'isActive'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class UserRole extends BaseModel<UserRoleAttributes, UserRoleCreationAttributes> implements UserRoleAttributes {
  declare userId: string
  declare roleId: string
  declare companyId: string | null
  declare locationId: string | null
  declare departmentId: string | null
  declare assignedBy: string | null
  declare validFrom: Date | null
  declare validUntil: Date | null
  declare isActive: boolean
}

UserRole.init(
  {
    ...baseModelColumns,
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    roleId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    companyId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    departmentId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    assignedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    validFrom: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    validUntil: {
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
