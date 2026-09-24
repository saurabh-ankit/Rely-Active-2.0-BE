import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { Resident } from './resident.model.js'
import type { DoctorAppointment } from './doctorAppointment.model.js'
import type { VitalSetting } from './vitalSetting.model.js'

export interface ResidentVitalAttributes extends BaseAttributes {
  residentId: string
  locationId: string
  appointmentId?: string | null
  vitalSettingId?: string | null
  name: string
  unit?: string | null
  value?: string | null
  note?: string | null
  recordedAt: Date
  isActive?: boolean
  isDeleted?: boolean
}

export type ResidentVitalCreationAttributes = Optional<
  ResidentVitalAttributes,
  | 'id'
  | 'appointmentId'
  | 'vitalSettingId'
  | 'unit'
  | 'value'
  | 'note'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class ResidentVital
  extends BaseModel<ResidentVitalAttributes, ResidentVitalCreationAttributes>
  implements ResidentVitalAttributes
{
  declare residentId: string
  declare locationId: string
  declare appointmentId: string | null
  declare vitalSettingId: string | null
  declare name: string
  declare unit: string | null
  declare value: string | null
  declare note: string | null
  declare recordedAt: Date
  declare isActive: boolean
  declare isDeleted: boolean

  declare resident?: Resident
  declare appointment?: DoctorAppointment
  declare vitalSetting?: VitalSetting
}

ResidentVital.init(
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
    vitalSettingId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'FK -> vital_settings.id',
    },
    name: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    unit: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    value: {
      type: DataTypes.STRING(100),
      allowNull: true,
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
    tableName: 'resident_vitals',
    timestamps: true,
    indexes: [
      { fields: ['residentId'], name: 'idx_resident_vitals_resident' },
      { fields: ['locationId'], name: 'idx_resident_vitals_location' },
      { fields: ['appointmentId'], name: 'idx_resident_vitals_appointment' },
    ],
  },
)

export default ResidentVital
