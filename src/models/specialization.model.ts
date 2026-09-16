import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface SpecializationAttributes extends BaseAttributes {
  name: string
  code: string
  description?: string | null
  isActive: boolean
  isDeleted: boolean
}

export type SpecializationCreationAttributes = Optional<
  SpecializationAttributes,
  'id' | 'description' | 'isActive' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class Specialization
  extends BaseModel<SpecializationAttributes, SpecializationCreationAttributes>
  implements SpecializationAttributes
{
  declare name: string
  declare code: string
  declare description: string | null
  declare isActive: boolean
  declare isDeleted: boolean
}

Specialization.init(
  {
    ...baseModelColumns,
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
    tableName: 'specializations',
    timestamps: true,
  },
)

export default Specialization
