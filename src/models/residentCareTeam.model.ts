import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

import type { Resident } from './resident.model.js'
import type { User } from './user.model.js'
import type { Role } from './role.model.js'
import type { UserDetail } from './userDetail.model.js'

export type CareTeamRole = 'DOCTOR' | 'NURSE'

export interface ResidentCareTeamAttributes extends BaseAttributes {
  residentId: string
  userId: string
  role: CareTeamRole
  locId: string
  note?: string | null
  isActive?: boolean
  isDeleted?: boolean
}

export type ResidentCareTeamCreationAttributes = Optional<
  ResidentCareTeamAttributes,
  'id' | 'note' | 'isActive' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class ResidentCareTeam
  extends BaseModel<ResidentCareTeamAttributes, ResidentCareTeamCreationAttributes>
  implements ResidentCareTeamAttributes
{
  declare residentId: string
  declare userId: string
  declare role: CareTeamRole
  declare locId: string
  declare note: string | null
  declare isActive: boolean
  declare isDeleted: boolean

  // Associations
  declare resident?: Resident
  declare user?: User & { profile?: UserDetail; userRole?: Role }
}

ResidentCareTeam.init(
  {
    ...baseModelColumns,
    residentId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> residents.id',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> users.id',
    },
    role: {
      type: DataTypes.ENUM('DOCTOR', 'NURSE'),
      allowNull: false,
      comment: 'Care team role: DOCTOR or NURSE',
    },
    locId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> properties.id',
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'resident_care_teams',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['resident_id', 'user_id'],
        name: 'uq_resident_care_team_member',
        where: { is_deleted: false },
      },
    ],
  },
)

export default ResidentCareTeam
