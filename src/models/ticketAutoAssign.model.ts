import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

/* ---------------------------------------------------------------- settings */

/** The auto-assign toggle for one property + department (docs/ticket-auto-assign.md). */
export interface TicketAutoAssignSettingAttributes extends BaseAttributes {
  locationId: string
  departmentId: string
  isEnabled: boolean
  responseTimeoutMinutes: number
}

export type TicketAutoAssignSettingCreationAttributes = Optional<
  TicketAutoAssignSettingAttributes,
  'id' | 'isEnabled' | 'responseTimeoutMinutes' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class TicketAutoAssignSetting
  extends BaseModel<TicketAutoAssignSettingAttributes, TicketAutoAssignSettingCreationAttributes>
  implements TicketAutoAssignSettingAttributes
{
  declare locationId: string
  declare departmentId: string
  declare isEnabled: boolean
  declare responseTimeoutMinutes: number
}

TicketAutoAssignSetting.init(
  {
    ...baseModelColumns,
    locationId: { type: DataTypes.UUID, allowNull: false },
    departmentId: { type: DataTypes.UUID, allowNull: false },
    isEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    responseTimeoutMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 2 },
  },
  {
    sequelize,
    tableName: 'ticket_auto_assign_settings',
    timestamps: true,
    indexes: [{ unique: true, fields: ['locationId', 'departmentId'] }],
  },
)

/* ---------------------------------------------------------------- attempts */

/** WAITING: nobody was on shift; the row (without a staff member) is the wait before checking again. */
export type TicketAutoAssignAttemptStatus = 'OFFERED' | 'WAITING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED'

/** One offer of a ticket to one staff member: the auto-assign log. */
export interface TicketAutoAssignAttemptAttributes extends BaseAttributes {
  ticketId: string
  userId?: string | null
  attemptNumber: number
  tatLoadMinutes?: number | null
  status: TicketAutoAssignAttemptStatus
  reason?: string | null
  tatOption?: string | null
  customTatDeadline?: Date | null
  offeredAt: Date
  expiresAt: Date
  respondedAt?: Date | null
}

export type TicketAutoAssignAttemptCreationAttributes = Optional<
  TicketAutoAssignAttemptAttributes,
  | 'id'
  | 'userId'
  | 'tatLoadMinutes'
  | 'status'
  | 'reason'
  | 'tatOption'
  | 'customTatDeadline'
  | 'respondedAt'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class TicketAutoAssignAttempt
  extends BaseModel<TicketAutoAssignAttemptAttributes, TicketAutoAssignAttemptCreationAttributes>
  implements TicketAutoAssignAttemptAttributes
{
  declare ticketId: string
  declare userId: string | null
  declare attemptNumber: number
  declare tatLoadMinutes: number | null
  declare status: TicketAutoAssignAttemptStatus
  declare reason: string | null
  declare tatOption: string | null
  declare customTatDeadline: Date | null
  declare offeredAt: Date
  declare expiresAt: Date
  declare respondedAt: Date | null
}

TicketAutoAssignAttempt.init(
  {
    ...baseModelColumns,
    ticketId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: true },
    attemptNumber: { type: DataTypes.INTEGER, allowNull: false },
    tatLoadMinutes: { type: DataTypes.INTEGER, allowNull: true },
    status: {
      type: DataTypes.ENUM('OFFERED', 'WAITING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'OFFERED',
    },
    reason: { type: DataTypes.TEXT, allowNull: true },
    tatOption: { type: DataTypes.STRING(64), allowNull: true },
    customTatDeadline: { type: DataTypes.DATE, allowNull: true },
    offeredAt: { type: DataTypes.DATE, allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    respondedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'ticket_auto_assign_attempts',
    timestamps: true,
  },
)
