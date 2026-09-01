import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export type EngagementStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED'

export interface RosterDoctorEngagementAttributes extends BaseAttributes {
  doctorProfileId: string
  companyId: string
  locationId: string
  validFrom: string
  validUntil: string
  serviceCategory: string
  clinicRoomId?: string | null
  defaultSlotCapacity?: number
  status?: EngagementStatus
  isDeleted?: boolean
}

export type RosterDoctorEngagementCreationAttributes = Optional<
  RosterDoctorEngagementAttributes,
  | 'id'
  | 'clinicRoomId'
  | 'defaultSlotCapacity'
  | 'status'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class RosterDoctorEngagement
  extends BaseModel<RosterDoctorEngagementAttributes, RosterDoctorEngagementCreationAttributes>
  implements RosterDoctorEngagementAttributes
{
  declare doctorProfileId: string
  declare companyId: string
  declare locationId: string
  declare validFrom: string
  declare validUntil: string
  declare serviceCategory: string
  declare clinicRoomId: string | null
  declare defaultSlotCapacity: number
  declare status: EngagementStatus
  declare isDeleted: boolean
}

RosterDoctorEngagement.init(
  {
    ...baseModelColumns,
    doctorProfileId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    companyId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    validFrom: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    validUntil: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    serviceCategory: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    clinicRoomId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    defaultSlotCapacity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 15,
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'EXPIRED'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'roster_doctor_engagements',
    timestamps: true,
  },
)

export default RosterDoctorEngagement
