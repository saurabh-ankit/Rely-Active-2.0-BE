import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

/** A recipient's answer to one question; which value is set depends on the question's answerType. */
export interface FeedbackAnswerAttributes extends BaseAttributes {
  recipientId: string
  questionId: string
  answerText?: string | null
  selectedOptions?: string[] | null
  ratingValue?: number | null
}

export type FeedbackAnswerCreationAttributes = Optional<
  FeedbackAnswerAttributes,
  'id' | 'answerText' | 'selectedOptions' | 'ratingValue' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class FeedbackAnswer
  extends BaseModel<FeedbackAnswerAttributes, FeedbackAnswerCreationAttributes>
  implements FeedbackAnswerAttributes
{
  declare recipientId: string
  declare questionId: string
  declare answerText: string | null
  declare selectedOptions: string[] | null
  declare ratingValue: number | null
}

FeedbackAnswer.init(
  {
    ...baseModelColumns,
    recipientId: { type: DataTypes.UUID, allowNull: false },
    questionId: { type: DataTypes.UUID, allowNull: false },
    answerText: { type: DataTypes.TEXT, allowNull: true },
    selectedOptions: { type: DataTypes.JSON, allowNull: true },
    ratingValue: { type: DataTypes.TINYINT, allowNull: true },
  },
  { sequelize, tableName: 'feedback_answers', timestamps: true },
)

export default FeedbackAnswer
