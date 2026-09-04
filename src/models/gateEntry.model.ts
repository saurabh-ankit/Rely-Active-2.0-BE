import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { VisitorType } from './gatePreapproved.model.js'

export type EntrySource = 'Preapproved' | 'Walkin'
export type EntryStatus = 'PendingApproval' | 'Approved' | 'Rejected' | 'Inside' | 'Completed'

export interface GateEntryAttributes extends BaseAttributes {
  locId: string
  preapprovedId?: string | null
  entrySource: EntrySource
  visitorType: VisitorType
  visitorName: string
  visitorPhone?: string | null
  unitId?: string | null
  status: EntryStatus
  clockedInAt?: Date | null
  clockedOutAt?: Date | null
  clockedInBy?: string | null
  clockedOutBy?: string | null
  approvedBy?: string | null
  vehicleNumber?: string | null
  visitorPhotos?: string[] | null
  notes?: string | null
  company?: string | null
  personToMeet?: string | null
}

export type GateEntryCreationAttributes = Optional<
  GateEntryAttributes,
  | 'id'
  | 'preapprovedId'
  | 'visitorPhone'
  | 'unitId'
  | 'status'
  | 'clockedInAt'
  | 'clockedOutAt'
  | 'clockedInBy'
  | 'clockedOutBy'
  | 'approvedBy'
  | 'vehicleNumber'
  | 'visitorPhotos'
  | 'notes'
  | 'company'
  | 'personToMeet'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class GateEntry
  extends BaseModel<GateEntryAttributes, GateEntryCreationAttributes>
  implements GateEntryAttributes
{
  declare locId: string
  declare preapprovedId: string | null
  declare entrySource: EntrySource
  declare visitorType: VisitorType
  declare visitorName: string
  declare visitorPhone: string | null
  declare unitId: string | null
  declare status: EntryStatus
  declare clockedInAt: Date | null
  declare clockedOutAt: Date | null
  declare clockedInBy: string | null
  declare clockedOutBy: string | null
  declare approvedBy: string | null
  declare vehicleNumber: string | null
  declare visitorPhotos: string[] | null
  declare notes: string | null
  declare company: string | null
  declare personToMeet: string | null
}

GateEntry.init(
  {
    ...baseModelColumns,
    locId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    preapprovedId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    entrySource: {
      type: DataTypes.ENUM('Preapproved', 'Walkin'),
      allowNull: false,
    },
    visitorType: {
      type: DataTypes.ENUM('Guest', 'Delivery', 'Cab', 'Office', 'Other'),
      allowNull: false,
    },
    visitorName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    visitorPhone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    unitId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('PendingApproval', 'Approved', 'Rejected', 'Inside', 'Completed'),
      defaultValue: 'PendingApproval',
    },
    clockedInAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    clockedOutAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    clockedInBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    clockedOutBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    approvedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    vehicleNumber: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    visitorPhotos: {
      type: DataTypes.JSON,
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
    tableName: 'gate_entries',
    timestamps: true,
  },
)

export default GateEntry
