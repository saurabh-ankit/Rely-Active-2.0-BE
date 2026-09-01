import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export type RosterTargetType =
  | 'PROPERTY'
  | 'PROPERTY_BLOCK'
  | 'PROPERTY_FLOOR'
  | 'PROPERTY_UNIT'
  | 'DEPARTMENT'
  | 'CLINIC_VENUE'
  | 'SERVICE'

export interface RosterAssignmentTargetAttributes extends BaseAttributes {
  rosterAssignmentId: string
  targetType: RosterTargetType
  targetId: string
}

export type RosterAssignmentTargetCreationAttributes = Optional<
  RosterAssignmentTargetAttributes,
  'id' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class RosterAssignmentTarget
  extends BaseModel<RosterAssignmentTargetAttributes, RosterAssignmentTargetCreationAttributes>
  implements RosterAssignmentTargetAttributes
{
  declare rosterAssignmentId: string
  declare targetType: RosterTargetType
  declare targetId: string
}

RosterAssignmentTarget.init(
  {
    ...baseModelColumns,
    rosterAssignmentId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    targetType: {
      type: DataTypes.ENUM(
        'PROPERTY',
        'PROPERTY_BLOCK',
        'PROPERTY_FLOOR',
        'PROPERTY_UNIT',
        'DEPARTMENT',
        'CLINIC_VENUE',
        'SERVICE',
      ),
      allowNull: false,
    },
    targetId: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'roster_assignment_targets',
    timestamps: true,
  },
)

export default RosterAssignmentTarget
