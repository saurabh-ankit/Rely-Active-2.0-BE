import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

import type { Resident } from './resident.model.js'
import type { CareTask } from './careTasks.model.js'
import type { User } from './user.model.js'
import type { CareTaskAssignment } from './careTaskAssignment.model.js'

export interface AdditionalTaskChargeAttributes extends BaseAttributes {
  residentId: string
  featureId: string
  nurseId: string
  price: number
  unitPrice?: number | null
  taskName: string
  description?: string | null
  completedAt?: Date | string | null
  taskAssignmentId?: string | null
  isActive?: boolean
  isDeleted?: boolean
}

export type AdditionalTaskChargeCreationAttributes = Optional<
  AdditionalTaskChargeAttributes,
  | 'id'
  | 'completedAt'
  | 'unitPrice'
  | 'description'
  | 'taskAssignmentId'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class AdditionalTaskCharge
  extends BaseModel<AdditionalTaskChargeAttributes, AdditionalTaskChargeCreationAttributes>
  implements AdditionalTaskChargeAttributes
{
  declare residentId: string
  declare featureId: string
  declare nurseId: string
  declare price: number
  declare unitPrice: number | null
  declare taskName: string
  declare description: string | null
  declare completedAt: Date | string | null
  declare taskAssignmentId: string | null
  declare isActive: boolean
  declare isDeleted: boolean

  declare resident?: Resident
  declare feature?: CareTask
  declare nurse?: User
  declare taskAssignment?: CareTaskAssignment
}

AdditionalTaskCharge.init(
  {
    ...baseModelColumns,
    residentId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> residents.id',
    },
    featureId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> care_tasks.id',
    },
    nurseId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> users.id',
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('price')
        return val !== null && val !== undefined ? Number(val) : 0
      },
    },
    unitPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: null,
      get() {
        const val = this.getDataValue('unitPrice')
        return val !== null && val !== undefined ? Number(val) : null
      },
    },
    taskName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    taskAssignmentId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'FK -> care_task_assignments.id',
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
    tableName: 'additional_task_charges',
    timestamps: true,
  },
)

export default AdditionalTaskCharge
