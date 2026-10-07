import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { FeedbackAnswerType } from '../enums/feedback.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface FeedbackQuestionAttributes extends BaseAttributes {
  formId: string
  questionText: string
  answerType: FeedbackAnswerType
  /** Choices for SINGLE_CHOICE / MULTIPLE_CHOICE; null otherwise. */
  options?: string[] | null
  /** Highest star value for RATING questions; null otherwise. */
  ratingScale?: number | null
  isRequired: boolean
  sortOrder: number
}

export type FeedbackQuestionCreationAttributes = Optional<
  FeedbackQuestionAttributes,
  'id' | 'options' | 'ratingScale' | 'isRequired' | 'sortOrder' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class FeedbackQuestion
  extends BaseModel<FeedbackQuestionAttributes, FeedbackQuestionCreationAttributes>
  implements FeedbackQuestionAttributes
{
  declare formId: string
  declare questionText: string
  declare answerType: FeedbackAnswerType
  declare options: string[] | null
  declare ratingScale: number | null
  declare isRequired: boolean
  declare sortOrder: number
}

FeedbackQuestion.init(
  {
    ...baseModelColumns,
    formId: { type: DataTypes.UUID, allowNull: false },
    questionText: { type: DataTypes.TEXT, allowNull: false },
    answerType: { type: DataTypes.ENUM(...Object.values(FeedbackAnswerType)), allowNull: false },
    options: { type: DataTypes.JSON, allowNull: true },
    ratingScale: { type: DataTypes.TINYINT, allowNull: true },
    isRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { sequelize, tableName: 'feedback_questions', timestamps: true },
)

export default FeedbackQuestion
