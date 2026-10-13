import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { IncidentSeverity, IncidentType } from '../enums/incident.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { ConsultantFileEntry } from './consultant.model.js'
import type { Resident } from './resident.model.js'
import type { User } from './user.model.js'

export interface ResidentIncidentAttributes extends BaseAttributes {
  residentId: string
  locationId: string
  incidentType: IncidentType
  severity: IncidentSeverity
  incidentAt: Date
  notes?: string | null
  photos: ConsultantFileEntry[]
  voiceNotes: ConsultantFileEntry[]
  isDeleted?: boolean
}

export type ResidentIncidentCreationAttributes = Optional<
  ResidentIncidentAttributes,
  'id' | 'notes' | 'photos' | 'voiceNotes' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class ResidentIncident
  extends BaseModel<ResidentIncidentAttributes, ResidentIncidentCreationAttributes>
  implements ResidentIncidentAttributes
{
  declare residentId: string
  declare locationId: string
  declare incidentType: IncidentType
  declare severity: IncidentSeverity
  declare incidentAt: Date
  declare notes: string | null
  declare photos: ConsultantFileEntry[]
  declare voiceNotes: ConsultantFileEntry[]
  declare isDeleted: boolean

  declare resident?: Resident
  declare creator?: User
}

ResidentIncident.init(
  {
    ...baseModelColumns,
    residentId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> residents.id',
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> properties.id',
    },
    incidentType: {
      type: DataTypes.ENUM(...Object.values(IncidentType)),
      allowNull: false,
    },
    severity: {
      type: DataTypes.ENUM(...Object.values(IncidentSeverity)),
      allowNull: false,
    },
    incidentAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    photos: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    voiceNotes: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'resident_incidents',
    timestamps: true,
    indexes: [{ fields: ['residentId', 'incidentAt'], name: 'idx_resident_incidents_resident_incident_at' }],
  },
)

export default ResidentIncident
