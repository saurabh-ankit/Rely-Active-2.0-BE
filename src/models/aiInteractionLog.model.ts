import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { Resident } from './resident.model.js'
import type { ResidentFamilyMember } from './residentFamilyMember.model.js'

export interface AiInteractionLogAttributes extends BaseAttributes {
  residentId?: string | null
  familyMemberId?: string | null
  model: string
  status: string
  tokens?: Record<string, unknown> | null
  data?: Record<string, unknown> | null
}

export type AiInteractionLogCreationAttributes = Optional<
  AiInteractionLogAttributes,
  'id' | 'residentId' | 'familyMemberId' | 'tokens' | 'data' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class AiInteractionLog
  extends BaseModel<AiInteractionLogAttributes, AiInteractionLogCreationAttributes>
  implements AiInteractionLogAttributes
{
  declare residentId: string | null
  declare familyMemberId: string | null
  declare model: string
  declare status: string
  declare tokens: Record<string, unknown> | null
  declare data: Record<string, unknown> | null

  // Associations
  declare resident?: Resident
  declare familyMember?: ResidentFamilyMember
}

AiInteractionLog.init(
  {
    ...baseModelColumns,
    residentId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'residents',
        key: 'id',
      },
    },
    familyMemberId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'resident_family_members',
        key: 'id',
      },
    },
    model: {
      type: DataTypes.STRING(128),
      allowNull: false,
      defaultValue: 'gemini-3.5-flash-lite',
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'SUCCESS',
    },
    tokens: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    data: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'ai_interaction_logs',
    timestamps: true,
  },
)

export default AiInteractionLog
