import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

import type { Resident } from './resident.model.js'
import type { CareTask } from './careTasks.model.js'
import type { Property } from './property.model.js'
import type { User } from './user.model.js'
import type { CareTaskAssignment } from './careTaskAssignment.model.js'

export type CompletionStatus = 'COMPLETED' | 'CANCELLED'

export interface ResidentCareTaskCompletionAttributes extends BaseAttributes {
  residentCareTaskAssignmentId: string

  residentId: string
  taskId: string

  propertyId?: string | null

  completedBy?: string | null
  completedAt: Date | string

  status: CompletionStatus

  description?: string | null
  remarks?: string | null

  isActive: boolean
  isDeleted: boolean
}

export type ResidentCareTaskCompletionCreationAttributes = Optional<
  ResidentCareTaskCompletionAttributes,
  | 'id'
  | 'propertyId'
  | 'completedBy'
  | 'status'
  | 'description'
  | 'remarks'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class ResidentCareTaskCompletion
  extends BaseModel<ResidentCareTaskCompletionAttributes, ResidentCareTaskCompletionCreationAttributes>
  implements ResidentCareTaskCompletionAttributes
{
  declare residentCareTaskAssignmentId: string

  declare residentId: string
  declare taskId: string

  declare propertyId: string | null

  declare completedBy: string | null
  declare completedAt: Date | string

  declare status: CompletionStatus

  declare description: string | null
  declare remarks: string | null

  declare isActive: boolean
  declare isDeleted: boolean

  // Relations
  declare resident?: Resident
  declare task?: CareTask
  declare property?: Property
  declare completedByUser?: User
  declare assignment?: CareTaskAssignment
}

ResidentCareTaskCompletion.init(
  {
    ...baseModelColumns,

    residentCareTaskAssignmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> resident_care_task_assignments.id',
    },

    residentId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> residents.id',
    },

    taskId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> care_tasks.id',
    },

    propertyId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'FK -> properties.id',
    },

    completedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'FK -> users.id',
    },

    completedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    status: {
      type: DataTypes.ENUM('COMPLETED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'COMPLETED',
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },

    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },

    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    isDeleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'resident_care_task_completions',
    timestamps: true,
  },
)

export default ResidentCareTaskCompletion
