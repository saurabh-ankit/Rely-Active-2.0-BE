import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { RosterDoctorProfile } from './rosterDoctorProfile.model.js'
import type { User } from './user.model.js'

export type ResourceType = 'EMPLOYEE' | 'DOCTOR'
export type ResourceStatus = 'ACTIVE' | 'INACTIVE'

export interface SchedulingResourceAttributes extends BaseAttributes {
  companyId: string
  resourceType: ResourceType
  userId?: string | null
  doctorProfileId?: string | null
  status?: ResourceStatus
  effectiveFrom: string
  effectiveUntil?: string | null
  isDeleted?: boolean
}

export type SchedulingResourceCreationAttributes = Optional<
  SchedulingResourceAttributes,
  | 'id'
  | 'userId'
  | 'doctorProfileId'
  | 'status'
  | 'effectiveUntil'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class SchedulingResource
  extends BaseModel<SchedulingResourceAttributes, SchedulingResourceCreationAttributes>
  implements SchedulingResourceAttributes
{
  declare companyId: string
  declare resourceType: ResourceType
  declare userId: string | null
  declare user?: User | null
  declare doctorProfileId: string | null
  declare doctorProfile?: RosterDoctorProfile | null
  declare status: ResourceStatus
  declare effectiveFrom: string
  declare effectiveUntil: string | null
  declare isDeleted: boolean
}

SchedulingResource.init(
  {
    ...baseModelColumns,
    companyId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    resourceType: {
      type: DataTypes.ENUM('EMPLOYEE', 'DOCTOR'),
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    doctorProfileId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
    effectiveFrom: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    effectiveUntil: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'scheduling_resources',
    timestamps: true,
  },
)

export default SchedulingResource
