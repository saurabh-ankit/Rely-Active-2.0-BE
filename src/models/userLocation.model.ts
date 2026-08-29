import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface UserLocationAttributes extends BaseAttributes {
  userId: string
  locId: string
  roleId?: string | null
  companyId?: string | null
  departmentId?: string | null
  jobCategoryId?: string | null
  assignedBy?: string | null
  isActive?: boolean
  isDeleted?: boolean
}

export type UserLocationCreationAttributes = Optional<
  UserLocationAttributes,
  | 'id'
  | 'roleId'
  | 'companyId'
  | 'departmentId'
  | 'jobCategoryId'
  | 'assignedBy'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class UserLocation
  extends BaseModel<UserLocationAttributes, UserLocationCreationAttributes>
  implements UserLocationAttributes
{
  declare userId: string
  declare locId: string
  declare roleId: string | null
  declare companyId: string | null
  declare departmentId: string | null
  declare jobCategoryId: string | null
  declare assignedBy: string | null
  declare isActive: boolean
  declare isDeleted: boolean
}

UserLocation.init(
  {
    ...baseModelColumns,
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    locId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    roleId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    companyId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    departmentId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    jobCategoryId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    assignedBy: {
      type: DataTypes.UUID,
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
  },
  {
    sequelize,
    tableName: 'user_locations',
    timestamps: true,
  },
)

export default UserLocation
