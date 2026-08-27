import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'

export interface DepartmentAttributes {
  id: string
  location_id?: string | null
  name: string
  code: string
  description?: string | null
  isActive?: boolean
  createdAt?: Date
  updatedAt?: Date
}

export type DepartmentCreationAttributes = Optional<
  DepartmentAttributes,
  'id' | 'location_id' | 'description' | 'isActive' | 'createdAt' | 'updatedAt'
>

export class Department
  extends Model<DepartmentAttributes, DepartmentCreationAttributes>
  implements DepartmentAttributes
{
  declare id: string
  declare location_id: string | null
  declare name: string
  declare code: string
  declare description: string | null
  declare isActive: boolean
  declare readonly createdAt: Date
  declare readonly updatedAt: Date
}

Department.init(
  {
    id: {
      type: DataTypes.CHAR(36),
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    location_id: {
      type: DataTypes.CHAR(36),
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
