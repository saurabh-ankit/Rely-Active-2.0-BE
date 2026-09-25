import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { Resident } from './resident.model.js'
import type { DoctorAppointment } from './doctorAppointment.model.js'

export interface ResidentAllergyAttributes extends BaseAttributes {
  residentId: string
  locationId: string
  appointmentId?: string | null
  name: string
  note?: string | null
  recordedAt: Date
  isActive?: boolean
  isDeleted?: boolean
}

export type ResidentAllergyCreationAttributes = Optional<
  ResidentAllergyAttributes,
  'id' | 'appointmentId' | 'note' | 'isActive' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class ResidentAllergy
  extends BaseModel<ResidentAllergyAttributes, ResidentAllergyCreationAttributes>
  implements ResidentAllergyAttributes
{
  declare residentId: string
  declare locationId: string
  declare appointmentId: string | null
  declare name: string
  declare note: string | null
  declare recordedAt: Date
  declare isActive: boolean
  declare isDeleted: boolean

  declare resident?: Resident
  declare appointment?: DoctorAppointment
}

ResidentAllergy.init(
  {
    ...baseModelColumns,
    residentId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> residents.id',
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> properties.id',
    },
    appointmentId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'FK -> doctor_appointments.id',
    },
    name: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    recordedAt: {
      type: DataTypes.DATE,
      allowNull: false,
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
    tableName: 'resident_allergies',
    timestamps: true,
    indexes: [
      { fields: ['residentId'], name: 'idx_resident_allergies_resident' },
      { fields: ['locationId'], name: 'idx_resident_allergies_location' },
      { fields: ['appointmentId'], name: 'idx_resident_allergies_appointment' },
    ],
  },
)

export default ResidentAllergy
