import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

/**
 * Join table between a doctor (a `users` row with the DOCTOR role) and the
 * specializations they hold. `isPrimary` marks the one shown by default.
 */
export interface DoctorSpecializationAttributes extends BaseAttributes {
  userId: string
  specializationId: string
  isPrimary: boolean
  isActive: boolean
  isDeleted: boolean
}

export type DoctorSpecializationCreationAttributes = Optional<
  DoctorSpecializationAttributes,
  'id' | 'isPrimary' | 'isActive' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class DoctorSpecialization
  extends BaseModel<DoctorSpecializationAttributes, DoctorSpecializationCreationAttributes>
  implements DoctorSpecializationAttributes
{
  declare userId: string
  declare specializationId: string
  declare isPrimary: boolean
  declare isActive: boolean
  declare isDeleted: boolean
}

DoctorSpecialization.init(
  {
    ...baseModelColumns,
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    specializationId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    isPrimary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
    tableName: 'doctor_specializations',
    timestamps: true,
  },
)

export default DoctorSpecialization
