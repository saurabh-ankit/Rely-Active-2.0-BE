import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { AppointmentStatus } from '../enums/appointment.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface DoctorAppointmentAttributes extends BaseAttributes {
  locationId: string
  shiftEmployeeDateId: string
  residentId: string
  familyMemberId?: string | null
  doctorId: string
  appointmentDate: string
  slotTimeRange: string
  status: AppointmentStatus
  bookedAt: Date
  cancelledAt?: Date | null
  cancellationReason?: string | null
  attendedAt?: Date | null
  notes?: string | null
  isActive: boolean
  isDeleted: boolean
}

export type DoctorAppointmentCreationAttributes = Optional<
  DoctorAppointmentAttributes,
  | 'id'
  | 'familyMemberId'
  | 'status'
  | 'cancelledAt'
  | 'cancellationReason'
  | 'attendedAt'
  | 'notes'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class DoctorAppointment
  extends BaseModel<DoctorAppointmentAttributes, DoctorAppointmentCreationAttributes>
  implements DoctorAppointmentAttributes
{
  declare locationId: string
  declare shiftEmployeeDateId: string
  declare residentId: string
  declare familyMemberId: string | null
  declare doctorId: string
  declare appointmentDate: string
  declare slotTimeRange: string
  declare status: AppointmentStatus
  declare bookedAt: Date
  declare cancelledAt: Date | null
  declare cancellationReason: string | null
  declare attendedAt: Date | null
  declare notes: string | null
  declare isActive: boolean
  declare isDeleted: boolean
}

DoctorAppointment.init(
  {
    ...baseModelColumns,
    locationId: { type: DataTypes.UUID, allowNull: false },
    shiftEmployeeDateId: { type: DataTypes.UUID, allowNull: false },
    residentId: { type: DataTypes.UUID, allowNull: false },
    familyMemberId: { type: DataTypes.UUID, allowNull: true },
    doctorId: { type: DataTypes.UUID, allowNull: false },
    appointmentDate: { type: DataTypes.DATEONLY, allowNull: false },
    slotTimeRange: { type: DataTypes.STRING(20), allowNull: false },
    status: {
      type: DataTypes.ENUM(...Object.values(AppointmentStatus)),
      allowNull: false,
      defaultValue: AppointmentStatus.CONFIRMED,
    },
    bookedAt: { type: DataTypes.DATE, allowNull: false },
    cancelledAt: { type: DataTypes.DATE, allowNull: true },
    cancellationReason: { type: DataTypes.STRING(500), allowNull: true },
    attendedAt: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, tableName: 'doctor_appointments', timestamps: true },
)

export default DoctorAppointment
