import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export type VisitorType = 'Guest' | 'Delivery' | 'Cab' | 'Service' | 'Material' | 'Office'
export type InviteStatus = 'Pending' | 'Scanned' | 'Expired' | 'Cancelled'

export interface GateInviteAttributes extends BaseAttributes {
  locId: string
  unitId?: string | null
  residentId?: string | null
  visitorName: string
  visitorPhone?: string | null
  visitorType: VisitorType
  expectedDate?: Date | null
  expectedTime?: string | null
  qrCode?: string | null
  qrCodeImage?: string | null
  status: InviteStatus
  numberOfPeople?: number | null
  photo?: string | null
  vehicleNumber?: string | null
  notes?: string | null
  company?: string | null
  personToMeet?: string | null
}

export type GateInviteCreationAttributes = Optional<
  GateInviteAttributes,
  | 'id'
  | 'unitId'
  | 'residentId'
  | 'visitorPhone'
  | 'expectedDate'
  | 'expectedTime'
  | 'qrCode'
  | 'qrCodeImage'
  | 'status'
  | 'numberOfPeople'
  | 'photo'
  | 'vehicleNumber'
  | 'notes'
  | 'company'
  | 'personToMeet'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class GateInvite
  extends BaseModel<GateInviteAttributes, GateInviteCreationAttributes>
  implements GateInviteAttributes
{
  declare locId: string
  declare unitId: string | null
  declare residentId: string | null
  declare visitorName: string
  declare visitorPhone: string | null
  declare visitorType: VisitorType
  declare expectedDate: Date | null
  declare expectedTime: string | null
  declare qrCode: string | null
  declare qrCodeImage: string | null
  declare status: InviteStatus
  declare numberOfPeople: number | null
  declare photo: string | null
  declare vehicleNumber: string | null
  declare notes: string | null
  declare company: string | null
  declare personToMeet: string | null
}

GateInvite.init(
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
      type: DataTypes.ENUM('Guest', 'Delivery', 'Cab', 'Service', 'Material', 'Office'),
      allowNull: false,
    },
    expectedDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    expectedTime: {
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
      type: DataTypes.ENUM('Pending', 'Scanned', 'Expired', 'Cancelled'),
      defaultValue: 'Pending',
    },
    numberOfPeople: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    photo: {
      type: DataTypes.TEXT,
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
    tableName: 'gate_invites',
    timestamps: true,
  },
)

export default GateInvite
