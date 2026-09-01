import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export type ReplacementStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED'

export interface RosterReplacementAttributes extends BaseAttributes {
  rosterAssignmentDateId: string
  originalResourceId: string
  replacementResourceId: string
  reason: string
  status?: ReplacementStatus
  approvedBy?: string | null
  approvedAt?: Date | null
}

export type RosterReplacementCreationAttributes = Optional<
  RosterReplacementAttributes,
  'id' | 'status' | 'approvedBy' | 'approvedAt' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class RosterReplacement
  extends BaseModel<RosterReplacementAttributes, RosterReplacementCreationAttributes>
  implements RosterReplacementAttributes
{
  declare rosterAssignmentDateId: string
  declare originalResourceId: string
  declare replacementResourceId: string
  declare reason: string
  declare status: ReplacementStatus
  declare approvedBy: string | null
  declare approvedAt: Date | null
}

RosterReplacement.init(
  {
    ...baseModelColumns,
    rosterAssignmentDateId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    originalResourceId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    replacementResourceId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('REQUESTED', 'APPROVED', 'REJECTED'),
      allowNull: false,
      defaultValue: 'REQUESTED',
    },
    approvedBy: {
      type: DataTypes.CHAR(36),
      allowNull: true,
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'roster_replacements',
    timestamps: true,
  },
)

export default RosterReplacement
