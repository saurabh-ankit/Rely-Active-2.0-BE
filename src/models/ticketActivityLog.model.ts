import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { TicketActivityType } from '../enums/ticket.enum.js'

export interface TicketActivityLogAttributes extends BaseAttributes {
  ticketId: string
  performedByUserId?: string | null
  performedByName?: string | null
  activityType: TicketActivityType | string
  fromStatus?: string | null
  toStatus?: string | null
  comment?: string | null
  attachments?: string[] | Record<string, unknown> | null
}

export type TicketActivityLogCreationAttributes = Optional<
  TicketActivityLogAttributes,
  | 'id'
  | 'performedByUserId'
  | 'performedByName'
  | 'fromStatus'
  | 'toStatus'
  | 'comment'
  | 'attachments'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class TicketActivityLog
  extends BaseModel<TicketActivityLogAttributes, TicketActivityLogCreationAttributes>
  implements TicketActivityLogAttributes
{
  declare ticketId: string
  declare performedByUserId: string | null
  declare performedByName: string | null
  declare activityType: TicketActivityType | string
  declare fromStatus: string | null
  declare toStatus: string | null
  declare comment: string | null
  declare attachments: string[] | Record<string, unknown> | null
}

TicketActivityLog.init(
  {
    ...baseModelColumns,
    ticketId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    performedByUserId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    performedByName: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    activityType: {
      type: DataTypes.ENUM(
        'CREATED',
        'APPROVED',
        'ASSIGNED',
        'STATUS_CHANGE',
        'COMMENT_ADDED',
        'ATTACHMENT_ADDED',
        'PRIORITY_CHANGE',
        'UPDATED',
      ),
      allowNull: false,
    },
    fromStatus: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    toStatus: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    comment: {
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
    tableName: 'ticket_activity_logs',
    timestamps: true,
  },
)
