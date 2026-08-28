import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface DepartmentAttributes extends BaseAttributes {
  locationId?: string | null
  name: string
  code: string
  description?: string | null
  isActive?: boolean
}

export type DepartmentCreationAttributes = Optional<
  DepartmentAttributes,
  'id' | 'locationId' | 'description' | 'isActive' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class Department
  extends BaseModel<DepartmentAttributes, DepartmentCreationAttributes>
  implements DepartmentAttributes
{
  declare locationId: string | null
  declare name: string
  declare code: string
  declare description: string | null
  declare isActive: boolean
}

Department.init(
  {
    ...baseModelColumns,
    locationId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(50),
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
    tableName: 'departments',
    timestamps: true,
  },
)

export default Department
