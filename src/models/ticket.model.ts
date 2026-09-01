import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { TicketCategory, TicketPriority, TicketStatus } from '../enums/ticket.enum.js'

export interface TicketAttributes extends BaseAttributes {
  ticketNumber: string
  title: string
  description?: string | null
  category: TicketCategory | string
  priority: TicketPriority
  status: TicketStatus
  locId: string
  unitId?: string | null
  residentId?: string | null
  familyMemberId?: string | null
  raisedByUserId?: string | null
  departmentId?: string | null
  jobCategoryId?: string | null
  categoryId?: string | null
  subCategoryId?: string | null
  tatOption?: string | null
  customTatDeadline?: Date | null
  assignedToUserId?: string | null
  vendorId?: string | null
  assetId?: string | null
  approvedByUserId?: string | null
  approvedAt?: Date | null
  dueDate?: Date | null
  resolvedAt?: Date | null
  closedAt?: Date | null
  resolutionNotes?: string | null
  attachments?: string[] | Record<string, unknown> | null
}

export type TicketCreationAttributes = Optional<
  TicketAttributes,
  | 'id'
  | 'description'
  | 'unitId'
  | 'residentId'
  | 'familyMemberId'
  | 'raisedByUserId'
  | 'departmentId'
  | 'jobCategoryId'
  | 'categoryId'
  | 'subCategoryId'
  | 'tatOption'
  | 'customTatDeadline'
  | 'assignedToUserId'
  | 'vendorId'
  | 'assetId'
  | 'approvedByUserId'
  | 'approvedAt'
  | 'dueDate'
  | 'resolvedAt'
  | 'closedAt'
  | 'resolutionNotes'
  | 'attachments'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class Ticket extends BaseModel<TicketAttributes, TicketCreationAttributes> implements TicketAttributes {
  declare ticketNumber: string
  declare title: string
  declare description: string | null
  declare category: TicketCategory | string
  declare priority: TicketPriority
  declare status: TicketStatus
  declare locId: string
  declare unitId: string | null
  declare residentId: string | null
  declare familyMemberId: string | null
  declare raisedByUserId: string | null
  declare departmentId: string | null
  declare jobCategoryId: string | null
  declare categoryId: string | null
  declare subCategoryId: string | null
  declare tatOption: string | null
  declare customTatDeadline: Date | null
  declare assignedToUserId: string | null
  declare vendorId: string | null
  declare assetId: string | null
  declare approvedByUserId: string | null
  declare approvedAt: Date | null
  declare dueDate: Date | null
  declare resolvedAt: Date | null
  declare closedAt: Date | null
  declare resolutionNotes: string | null
  declare attachments: string[] | Record<string, unknown> | null
}

Ticket.init(
  {
    ...baseModelColumns,
    ticketNumber: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    category: {
      type: DataTypes.STRING(128),
      allowNull: false,
      defaultValue: TicketCategory.REPAIR_MAINTENANCE,
    },
    priority: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: TicketPriority.MEDIUM,
    },
    status: {
      type: DataTypes.ENUM('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED', 'CANCELLED'),
      allowNull: false,
      defaultValue: TicketStatus.OPEN,
    },
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
    familyMemberId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    raisedByUserId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    departmentId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    jobCategoryId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    categoryId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    subCategoryId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    tatOption: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: '1-2 hour',
    },
    customTatDeadline: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    assignedToUserId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    vendorId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    assetId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    approvedByUserId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    dueDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    closedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    resolutionNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    attachments: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'tickets',
    timestamps: true,
  },
)
