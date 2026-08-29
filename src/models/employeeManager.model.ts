import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface EmployeeManagerAttributes extends BaseAttributes {
  userId: string
  managerId?: string | null
  locId: string
  isActive?: boolean
  isDeleted?: boolean
}

export type EmployeeManagerCreationAttributes = Optional<
  EmployeeManagerAttributes,
  'id' | 'managerId' | 'isActive' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class EmployeeManager
  extends BaseModel<EmployeeManagerAttributes, EmployeeManagerCreationAttributes>
  implements EmployeeManagerAttributes
{
  declare userId: string
  declare managerId: string | null
  declare locId: string
  declare isActive: boolean
  declare isDeleted: boolean
}

EmployeeManager.init(
  {
    ...baseModelColumns,
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    managerId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    locId: {
      type: DataTypes.UUID,
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
    tableName: 'employee_managers',
    timestamps: true,
  },
)

export default EmployeeManager
