import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { IncidentSopStep } from './incidentSopStep.model.js'
import type { User } from './user.model.js'

/** Progress of one SOP step on one incident; created the first time the step is touched. */
export interface ResidentIncidentSopStepAttributes extends BaseAttributes {
  incidentId: string
  sopStepId: string
  isCompleted: boolean
  completedAt?: Date | null
  completedBy?: string | null
  note?: string | null
}

export type ResidentIncidentSopStepCreationAttributes = Optional<
  ResidentIncidentSopStepAttributes,
  'id' | 'completedAt' | 'completedBy' | 'note' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class ResidentIncidentSopStep
  extends BaseModel<ResidentIncidentSopStepAttributes, ResidentIncidentSopStepCreationAttributes>
  implements ResidentIncidentSopStepAttributes
{
  declare incidentId: string
  declare sopStepId: string
  declare isCompleted: boolean
  declare completedAt: Date | null
  declare completedBy: string | null
  declare note: string | null

  declare step?: IncidentSopStep
  declare completer?: User
}

ResidentIncidentSopStep.init(
  {
    ...baseModelColumns,
    incidentId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> resident_incidents.id',
    },
    sopStepId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> incident_sop_steps.id',
    },
    isCompleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'FK -> users.id',
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'resident_incident_sop_steps',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['incidentId', 'sopStepId'], name: 'uq_resident_incident_sop_steps_incident_step' },
    ],
  },
)

export default ResidentIncidentSopStep
