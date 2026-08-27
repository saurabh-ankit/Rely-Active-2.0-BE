import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'

export interface JobCategoryAttributes {
  id: string
  department_id: string
  name: string
  code: string
  description?: string | null
  isActive?: boolean
  createdAt?: Date
  updatedAt?: Date
}

export type JobCategoryCreationAttributes = Optional<
  JobCategoryAttributes,
  'id' | 'description' | 'isActive' | 'createdAt' | 'updatedAt'
>

export class JobCategory
  extends Model<JobCategoryAttributes, JobCategoryCreationAttributes>
  implements JobCategoryAttributes
{
  declare id: string
  declare department_id: string
  declare name: string
  declare code: string
  declare description: string | null
  declare isActive: boolean
  declare readonly createdAt: Date
  declare readonly updatedAt: Date
}

JobCategory.init(
  {
    id: {
      type: DataTypes.CHAR(36),
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    department_id: {
      type: DataTypes.CHAR(36),
      allowNull: false,
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
    tableName: 'job_categories',
    timestamps: true,
  },
)

export default JobCategory
