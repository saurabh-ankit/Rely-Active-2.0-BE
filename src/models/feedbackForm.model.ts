import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { FeedbackAudience, FeedbackFormStatus } from '../enums/feedback.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { FeedbackQuestion } from './feedbackQuestion.model.js'
import type { FeedbackFormRecipient } from './feedbackFormRecipient.model.js'

export interface FeedbackFormAttributes extends BaseAttributes {
  locationId: string
  title: string
  expiryDate: Date
  /** A SENT form is locked: its questions can no longer be edited. */
  status: FeedbackFormStatus
  audience?: FeedbackAudience | null
  sentAt?: Date | null
  isDeleted: boolean
}

export type FeedbackFormCreationAttributes = Optional<
  FeedbackFormAttributes,
  'id' | 'status' | 'audience' | 'sentAt' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class FeedbackForm
  extends BaseModel<FeedbackFormAttributes, FeedbackFormCreationAttributes>
  implements FeedbackFormAttributes
{
  declare locationId: string
  declare title: string
  declare expiryDate: Date
  declare status: FeedbackFormStatus
  declare audience: FeedbackAudience | null
  declare sentAt: Date | null
  declare isDeleted: boolean

  declare questions?: FeedbackQuestion[]
  declare recipients?: FeedbackFormRecipient[]
}

FeedbackForm.init(
  {
    ...baseModelColumns,
    locationId: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: false },
    expiryDate: { type: DataTypes.DATE, allowNull: false },
    status: {
      type: DataTypes.ENUM(...Object.values(FeedbackFormStatus)),
      allowNull: false,
      defaultValue: FeedbackFormStatus.DRAFT,
    },
    audience: { type: DataTypes.ENUM(...Object.values(FeedbackAudience)), allowNull: true },
    sentAt: { type: DataTypes.DATE, allowNull: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, tableName: 'feedback_forms', timestamps: true },
)

export default FeedbackForm
