import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { DiagnosisCondition, DiagnosisStatus } from '../enums/diagnosis.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { DoctorAppointment } from './doctorAppointment.model.js'
import type { Resident } from './resident.model.js'
import type { User } from './user.model.js'
import type { MedicationTiming } from './residentMedication.model.js'

export interface ConsultantAllergyEntry {
  id: string
  name: string
  note: string | null
  recordedAt: string
}

export interface ConsultantVitalEntry {
  id: string
  vitalSettingId: string
  name: string
  unit: string
  value: string
  note: string | null
  recordedAt: string
}

export interface ConsultantMedicationEntry {
  id: string
  inventoryItemId: string
  medicineName: string
  startDate: string
  endDate: string | null
  isUntilDischarge: boolean
  timings: MedicationTiming[]
  note: string | null
}

/** Same shape as medication; inventory items must be packType vial. */
export type ConsultantInsulinEntry = ConsultantMedicationEntry

export type ConsultantFileType = 'IMAGE' | 'PDF' | 'AUDIO'

/** A file uploaded to S3 with the diagnosis note (image/PDF attachment or voice note). */
export interface ConsultantFileEntry {
  id: string
  url: string
  key: string
  name: string
  contentType: string
  size: number
  fileType: ConsultantFileType
  uploadedAt: string
  uploadedByUserId: string
}

export interface ConsultantAttributes extends BaseAttributes {
  appointmentId: string
  residentId: string
  locationId: string
  doctorId: string
  allergies: ConsultantAllergyEntry[]
  vitals: ConsultantVitalEntry[]
  medications: ConsultantMedicationEntry[]
  insulin: ConsultantInsulinEntry[]
  note?: string | null
  attachments?: ConsultantFileEntry[] | null
  voiceNotes?: ConsultantFileEntry[] | null
  condition?: DiagnosisCondition | null
  status: DiagnosisStatus
  completedAt?: Date | null
  isActive?: boolean
  isDeleted?: boolean
}

export type ConsultantCreationAttributes = Optional<
  ConsultantAttributes,
  | 'id'
  | 'allergies'
  | 'vitals'
  | 'medications'
  | 'insulin'
  | 'note'
  | 'attachments'
  | 'voiceNotes'
  | 'condition'
  | 'status'
  | 'completedAt'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class Consultant
  extends BaseModel<ConsultantAttributes, ConsultantCreationAttributes>
  implements ConsultantAttributes
{
  declare appointmentId: string
  declare residentId: string
  declare locationId: string
  declare doctorId: string
  declare allergies: ConsultantAllergyEntry[]
  declare vitals: ConsultantVitalEntry[]
  declare medications: ConsultantMedicationEntry[]
  declare insulin: ConsultantInsulinEntry[]
  declare note: string | null
  declare attachments: ConsultantFileEntry[] | null
  declare voiceNotes: ConsultantFileEntry[] | null
  declare condition: DiagnosisCondition | null
  declare status: DiagnosisStatus
  declare completedAt: Date | null
  declare isActive: boolean
  declare isDeleted: boolean

  declare resident?: Resident
  declare appointment?: DoctorAppointment
  declare doctor?: User
}

Consultant.init(
  {
    ...baseModelColumns,
    appointmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      comment: 'FK -> doctor_appointments.id (one consultant record per booking)',
    },
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
    doctorId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> users.id (attending doctor)',
    },
    allergies: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    vitals: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    medications: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    insulin: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    attachments: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Image/PDF files attached to the note (S3)',
    },
    voiceNotes: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Voice notes recorded with the note (S3)',
    },
    condition: {
      type: DataTypes.ENUM(...Object.values(DiagnosisCondition)),
      allowNull: true,
      comment: 'Resident condition recorded by the doctor',
    },
    status: {
      type: DataTypes.ENUM(...Object.values(DiagnosisStatus)),
      allowNull: false,
      defaultValue: DiagnosisStatus.DRAFT,
    },
    completedAt: {
      type: DataTypes.DATE,
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
    tableName: 'consultants',
    timestamps: true,
    indexes: [
      { fields: ['appointmentId'], unique: true, name: 'idx_consultants_appointment' },
      { fields: ['residentId'], name: 'idx_consultants_resident' },
      { fields: ['doctorId'], name: 'idx_consultants_doctor' },
      { fields: ['locationId'], name: 'idx_consultants_location' },
      { fields: ['status'], name: 'idx_consultants_status' },
    ],
  },
)

export default Consultant
