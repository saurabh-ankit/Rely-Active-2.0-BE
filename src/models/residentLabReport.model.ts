import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { PaymentMethod } from '../enums/billing.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { Resident } from './resident.model.js'
import type { DoctorAppointment } from './doctorAppointment.model.js'
import type { LabTestSetting } from './labTestSetting.model.js'

export const LAB_REPORT_SEVERITIES = ['normal', 'abnormal', 'severe'] as const
export type LabReportSeverity = (typeof LAB_REPORT_SEVERITIES)[number]

export const LAB_REPORT_PAYMENT_METHODS = Object.values(PaymentMethod) as PaymentMethod[]

export interface ResidentLabReportAttributes extends BaseAttributes {
  residentId: string
  locationId: string
  appointmentId?: string | null
  labTestSettingId: string
  severity: LabReportSeverity
  reportDate: string
  notes?: string | null
  cost?: number | null
  paymentMethod?: PaymentMethod | null
  reportFileUrl: string
  receiptFileUrl?: string | null
  isActive?: boolean
  isDeleted?: boolean
}

export type ResidentLabReportCreationAttributes = Optional<
  ResidentLabReportAttributes,
  | 'id'
  | 'appointmentId'
  | 'notes'
  | 'cost'
  | 'paymentMethod'
  | 'receiptFileUrl'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class ResidentLabReport
  extends BaseModel<ResidentLabReportAttributes, ResidentLabReportCreationAttributes>
  implements ResidentLabReportAttributes
{
  declare residentId: string
  declare locationId: string
  declare appointmentId: string | null
  declare labTestSettingId: string
  declare severity: LabReportSeverity
  declare reportDate: string
  declare notes: string | null
  declare cost: number | null
  declare paymentMethod: PaymentMethod | null
  declare reportFileUrl: string
  declare receiptFileUrl: string | null
  declare isActive: boolean
  declare isDeleted: boolean

  declare resident?: Resident
  declare appointment?: DoctorAppointment
  declare labTestSetting?: LabTestSetting
}

ResidentLabReport.init(
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
    labTestSettingId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> lab_test_settings.id',
    },
    severity: {
      type: DataTypes.ENUM(...LAB_REPORT_SEVERITIES),
      allowNull: false,
    },
    reportDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    cost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    paymentMethod: {
      type: DataTypes.ENUM(...LAB_REPORT_PAYMENT_METHODS),
      allowNull: true,
    },
    reportFileUrl: {
      type: DataTypes.STRING(1000),
      allowNull: false,
    },
    receiptFileUrl: {
      type: DataTypes.STRING(1000),
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
    tableName: 'resident_lab_reports',
    timestamps: true,
    indexes: [
      { fields: ['residentId'], name: 'idx_resident_lab_reports_resident' },
      { fields: ['locationId'], name: 'idx_resident_lab_reports_location' },
      { fields: ['labTestSettingId'], name: 'idx_resident_lab_reports_setting' },
      { fields: ['isDeleted', 'reportDate'], name: 'idx_resident_lab_reports_deleted_date' },
    ],
  },
)

export default ResidentLabReport
