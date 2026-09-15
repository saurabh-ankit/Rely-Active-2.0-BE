import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface TicketTatHistoryAttributes extends BaseAttributes {
  ticketId: string
  previousTatOption?: string | null
  previousTatDeadline?: Date | null
  updatedTatOption?: string | null
  updatedTatDeadline?: Date | null
  note: string
  changedByUserId: string
  changedByName?: string | null
  changedAt: Date
}

export type TicketTatHistoryCreationAttributes = Optional<
  TicketTatHistoryAttributes,
  | 'id'
  | 'previousTatOption'
  | 'previousTatDeadline'
  | 'updatedTatOption'
  | 'updatedTatDeadline'
  | 'changedByName'
  | 'changedAt'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class TicketTatHistory
  extends BaseModel<TicketTatHistoryAttributes, TicketTatHistoryCreationAttributes>
  implements TicketTatHistoryAttributes
{
  declare ticketId: string
  declare previousTatOption: string | null
  declare previousTatDeadline: Date | null
  declare updatedTatOption: string | null
  declare updatedTatDeadline: Date | null
  declare note: string
  declare changedByUserId: string
  declare changedByName: string | null
  declare changedAt: Date
}

TicketTatHistory.init(
  {
    ...baseModelColumns,
    ticketId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    previousTatOption: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    previousTatDeadline: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    updatedTatOption: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    updatedTatDeadline: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    changedByUserId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    changedByName: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    changedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'ticket_tat_histories',
    timestamps: true,
  },
)
