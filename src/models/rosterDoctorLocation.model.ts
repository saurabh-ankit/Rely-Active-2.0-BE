import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export type DoctorLocationStatus = 'ACTIVE' | 'INACTIVE'

export interface RosterDoctorLocationAttributes extends BaseAttributes {
  doctorProfileId: string
  locationId: string
  validFrom: string
  validUntil?: string | null
  status?: DoctorLocationStatus
  isDeleted?: boolean
}

export type RosterDoctorLocationCreationAttributes = Optional<
  RosterDoctorLocationAttributes,
  | 'id'
  | 'validUntil'
  | 'status'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class RosterDoctorLocation
  extends BaseModel<RosterDoctorLocationAttributes, RosterDoctorLocationCreationAttributes>
  implements RosterDoctorLocationAttributes
{
  declare doctorProfileId: string
  declare locationId: string
  declare validFrom: string
  declare validUntil: string | null
  declare status: DoctorLocationStatus
  declare isDeleted: boolean
}

RosterDoctorLocation.init(
  {
    ...baseModelColumns,
    doctorProfileId: {
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
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
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
    tableName: 'roster_doctor_locations',
    timestamps: true,
  },
)

export default RosterDoctorLocation
