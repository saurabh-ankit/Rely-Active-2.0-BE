import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export type DoctorType = 'IN_HOUSE' | 'VISITING'

export interface RosterDoctorProfileAttributes extends BaseAttributes {
  userId: string
  doctorType: DoctorType
  specialization: string
  medicalLicenseNumber: string
  licenseExpiryDate?: string | null
  consultationFee?: number | null
  maxPatientsPerSlot?: number | null
  defaultSlotDurationMinutes?: number | null
  isActive?: boolean
  isDeleted?: boolean
}

export type RosterDoctorProfileCreationAttributes = Optional<
  RosterDoctorProfileAttributes,
  | 'id'
  | 'doctorType'
  | 'licenseExpiryDate'
  | 'consultationFee'
  | 'maxPatientsPerSlot'
  | 'defaultSlotDurationMinutes'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class RosterDoctorProfile
  extends BaseModel<RosterDoctorProfileAttributes, RosterDoctorProfileCreationAttributes>
  implements RosterDoctorProfileAttributes
{
  declare userId: string
  declare doctorType: DoctorType
  declare specialization: string
  declare medicalLicenseNumber: string
  declare licenseExpiryDate: string | null
  declare consultationFee: number | null
  declare maxPatientsPerSlot: number | null
  declare defaultSlotDurationMinutes: number | null
  declare isActive: boolean
  declare isDeleted: boolean
}

RosterDoctorProfile.init(
  {
    ...baseModelColumns,
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
    },
    doctorType: {
      type: DataTypes.ENUM('IN_HOUSE', 'VISITING'),
      allowNull: false,
      defaultValue: 'IN_HOUSE',
    },
    specialization: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    medicalLicenseNumber: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    licenseExpiryDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    consultationFee: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    maxPatientsPerSlot: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    defaultSlotDurationMinutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'roster_doctor_profiles',
    timestamps: true,
  },
)

export default RosterDoctorProfile
