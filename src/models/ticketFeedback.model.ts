import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { TicketFeedbackRating } from '../enums/ticket.enum.js'

export interface TicketFeedbackAttributes extends BaseAttributes {
  ticketId: string
  residentId: string
  /** Null when the resident themselves left the feedback. */
  familyMemberId?: string | null
  rating: TicketFeedbackRating | string
  comment?: string | null
  attachments?: Record<string, unknown> | null
}

export type TicketFeedbackCreationAttributes = Optional<
  TicketFeedbackAttributes,
  'id' | 'familyMemberId' | 'comment' | 'attachments' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

import type { Resident } from './resident.model.js'
import type { ResidentFamilyMember } from './residentFamilyMember.model.js'

export class TicketFeedback
  extends BaseModel<TicketFeedbackAttributes, TicketFeedbackCreationAttributes>
  implements TicketFeedbackAttributes
{
  declare ticketId: string
  declare residentId: string
  declare familyMemberId: string | null
  declare rating: TicketFeedbackRating | string
  declare comment: string | null
  declare attachments: Record<string, unknown> | null

  declare resident?: Resident | null
  declare familyMember?: ResidentFamilyMember | null
}

TicketFeedback.init(
  {
    ...baseModelColumns,
    ticketId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    residentId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    familyMemberId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    rating: {
      type: DataTypes.ENUM('GOOD', 'AVERAGE', 'POOR'),
      allowNull: false,
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
    tableName: 'ticket_feedbacks',
    timestamps: true,
  },
)
