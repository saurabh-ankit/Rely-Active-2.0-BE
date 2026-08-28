import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface JobCategoryAttributes extends BaseAttributes {
  departmentId: string
  name: string
  code: string
  description?: string | null
  isActive?: boolean
}

export type JobCategoryCreationAttributes = Optional<
  JobCategoryAttributes,
  'id' | 'description' | 'isActive' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class JobCategory
  extends BaseModel<JobCategoryAttributes, JobCategoryCreationAttributes>
  implements JobCategoryAttributes
{
  declare departmentId: string
  declare name: string
  declare code: string
  declare description: string | null
  declare isActive: boolean
}

JobCategory.init(
  {
    ...baseModelColumns,
    departmentId: {
      type: DataTypes.UUID,
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
