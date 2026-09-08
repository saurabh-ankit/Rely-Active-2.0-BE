import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export type VisitorType = 'Guest' | 'Delivery' | 'Cab' | 'Office' | 'Other'
export type PreapprovedStatus = 'Pending' | 'Scanned' | 'Expired' | 'Cancelled' | 'Rejected'

export interface GatePreapprovedAttributes extends BaseAttributes {
  locId: string
  unitId?: string | null
  residentId?: string | null
  visitorName: string
  visitorPhone?: string | null
  visitorType: VisitorType
  startDate?: Date | null
  startTime?: string | null
  qrCode?: string | null
  qrCodeImage?: string | null
  status: PreapprovedStatus
  visitorPhotos?: string[] | null
  vehicleNumber?: string | null
  scheduleType?: 'ONCE' | 'FREQUENT' | null
  endDate?: Date | null
  endTime?: string | null
  notes?: string | null
  company?: string | null
  personToMeet?: string | null
}

export type GatePreapprovedCreationAttributes = Optional<
  GatePreapprovedAttributes,
  | 'id'
  | 'unitId'
  | 'residentId'
  | 'visitorPhone'
  | 'startDate'
  | 'startTime'
  | 'qrCode'
  | 'qrCodeImage'
  | 'status'
  | 'visitorPhotos'
  | 'vehicleNumber'
  | 'scheduleType'
  | 'endDate'
  | 'endTime'
  | 'notes'
  | 'company'
  | 'personToMeet'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class GatePreapproved
  extends BaseModel<GatePreapprovedAttributes, GatePreapprovedCreationAttributes>
  implements GatePreapprovedAttributes
{
  declare locId: string
  declare unitId: string | null
  declare residentId: string | null
  declare visitorName: string
  declare visitorPhone: string | null
  declare visitorType: VisitorType
  declare startDate: Date | null
  declare startTime: string | null
  declare qrCode: string | null
  declare qrCodeImage: string | null
  declare status: PreapprovedStatus
  declare visitorPhotos: string[] | null
  declare vehicleNumber: string | null
  declare scheduleType: 'ONCE' | 'FREQUENT' | null
  declare endDate: Date | null
  declare endTime: string | null
  declare notes: string | null
  declare company: string | null
  declare personToMeet: string | null
}

GatePreapproved.init(
  {
    ...baseModelColumns,
    locId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    unitId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    residentId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    visitorName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    visitorPhone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    visitorType: {
      type: DataTypes.ENUM('Guest', 'Delivery', 'Cab', 'Office', 'Other'),
      allowNull: false,
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    startTime: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    qrCode: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    qrCodeImage: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('Pending', 'Scanned', 'Expired', 'Cancelled', 'Rejected'),
      defaultValue: 'Pending',
    },
    visitorPhotos: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    vehicleNumber: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    scheduleType: {
      type: DataTypes.ENUM('ONCE', 'FREQUENT'),
      allowNull: true,
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    endTime: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    company: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    personToMeet: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'gate_preapproved',
    timestamps: true,
  },
)

export default GatePreapproved
