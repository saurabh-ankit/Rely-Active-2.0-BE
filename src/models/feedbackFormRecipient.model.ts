import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { FeedbackRecipientStatus, FeedbackRecipientType } from '../enums/feedback.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { FeedbackForm } from './feedbackForm.model.js'
import type { FeedbackAnswer } from './feedbackAnswer.model.js'
import type { Resident } from './resident.model.js'
import type { User } from './user.model.js'

/**
 * One row per person a form was sent to, captured when the form is sent.
 * Exactly one of residentId / userId is set, matching recipientType.
 */
export interface FeedbackFormRecipientAttributes extends BaseAttributes {
  formId: string
  recipientType: FeedbackRecipientType
  residentId?: string | null
  userId?: string | null
  status: FeedbackRecipientStatus
  submittedAt?: Date | null
}

export type FeedbackFormRecipientCreationAttributes = Optional<
  FeedbackFormRecipientAttributes,
  'id' | 'residentId' | 'userId' | 'status' | 'submittedAt' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class FeedbackFormRecipient
  extends BaseModel<FeedbackFormRecipientAttributes, FeedbackFormRecipientCreationAttributes>
  implements FeedbackFormRecipientAttributes
{
  declare formId: string
  declare recipientType: FeedbackRecipientType
  declare residentId: string | null
  declare userId: string | null
  declare status: FeedbackRecipientStatus
  declare submittedAt: Date | null

  declare form?: FeedbackForm
  declare answers?: FeedbackAnswer[]
  declare resident?: Resident | null
  declare user?: User | null
}

FeedbackFormRecipient.init(
  {
    ...baseModelColumns,
    formId: { type: DataTypes.UUID, allowNull: false },
    recipientType: { type: DataTypes.ENUM(...Object.values(FeedbackRecipientType)), allowNull: false },
    residentId: { type: DataTypes.UUID, allowNull: true },
    userId: { type: DataTypes.UUID, allowNull: true },
    status: {
      type: DataTypes.ENUM(...Object.values(FeedbackRecipientStatus)),
      allowNull: false,
      defaultValue: FeedbackRecipientStatus.PENDING,
    },
    submittedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, tableName: 'feedback_form_recipients', timestamps: true },
)

export default FeedbackFormRecipient
