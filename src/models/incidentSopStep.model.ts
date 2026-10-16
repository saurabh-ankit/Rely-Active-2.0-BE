import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { IncidentSopStepKey, IncidentType } from '../enums/incident.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

/** A Standard Operating Procedure step definition for an incident type. */
export interface IncidentSopStepAttributes extends BaseAttributes {
  incidentType: IncidentType
  stepKey: IncidentSopStepKey
  title: string
  isMandatory: boolean
  sortOrder: number
  isActive?: boolean
}

export type IncidentSopStepCreationAttributes = Optional<
  IncidentSopStepAttributes,
  'id' | 'isActive' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class IncidentSopStep
  extends BaseModel<IncidentSopStepAttributes, IncidentSopStepCreationAttributes>
  implements IncidentSopStepAttributes
{
  declare incidentType: IncidentType
  declare stepKey: IncidentSopStepKey
  declare title: string
  declare isMandatory: boolean
  declare sortOrder: number
  declare isActive: boolean
}

IncidentSopStep.init(
  {
    ...baseModelColumns,
    incidentType: {
      type: DataTypes.ENUM(...Object.values(IncidentType)),
      allowNull: false,
    },
    stepKey: {
      type: DataTypes.ENUM(...Object.values(IncidentSopStepKey)),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    isMandatory: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'incident_sop_steps',
    timestamps: true,
    indexes: [{ unique: true, fields: ['incidentType', 'stepKey'], name: 'uq_incident_sop_steps_type_key' }],
  },
)

export default IncidentSopStep
