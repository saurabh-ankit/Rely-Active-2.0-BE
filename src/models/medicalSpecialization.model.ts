import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export type SpecializationCategory = 'DOCTOR' | 'NURSE' | 'ALL' | 'OTHER'

export interface MedicalSpecializationAttributes extends BaseAttributes {
  name: string
  code: string
  category: SpecializationCategory
  description?: string | null
  isActive?: boolean
  isDeleted?: boolean
}

export type MedicalSpecializationCreationAttributes = Optional<
  MedicalSpecializationAttributes,
  'id' | 'description' | 'category' | 'isActive' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class MedicalSpecialization
  extends BaseModel<MedicalSpecializationAttributes, MedicalSpecializationCreationAttributes>
  implements MedicalSpecializationAttributes
{
  declare name: string
  declare code: string
  declare category: SpecializationCategory
  declare description: string | null
  declare isActive: boolean
  declare isDeleted: boolean
}

MedicalSpecialization.init(
  {
    ...baseModelColumns,
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    category: {
      type: DataTypes.ENUM('DOCTOR', 'NURSE', 'ALL', 'OTHER'),
      allowNull: false,
      defaultValue: 'ALL',
    },
    description: {
      type: DataTypes.TEXT,
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
    tableName: 'medical_specializations',
    timestamps: true,
  },
)

export default MedicalSpecialization
