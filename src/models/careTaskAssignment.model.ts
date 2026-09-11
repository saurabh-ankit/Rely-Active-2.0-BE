import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

import type { Resident } from './resident.model.js'
import type { CareTask } from './careTasks.model.js'
import type { Property } from './property.model.js'
import type { User } from './user.model.js'
import type { AdditionalTaskCharge } from './additionalTaskCharge.model.js'
import type { PackageSubscription } from './packageSubscription.model.js'
import type { Package } from './package.model.js'
import type { ResidentCareTaskCompletion } from './residentCareTaskCompletion.model.js'

export type BillingType = 'MONTHLY' | 'SESSION'

export type AssignmentSource = 'PACKAGE' | 'ADDON'

export type AssignmentStatus = 'ACTIVE' | 'STOPPED' | 'CANCELLED'

export interface CareTaskAssignmentAttributes extends BaseAttributes {
  residentId: string
  taskId: string
  propertyId?: string | null | undefined

  packageSubscriptionId?: string | null | undefined
  carePackageId?: string | null | undefined

  source: AssignmentSource

  billingType: BillingType
  price: number

  frequency?: number | null | undefined

  startDate: string | Date
  endDate?: string | Date | null | undefined

  time?: string | null | undefined

  status: AssignmentStatus

  customInstructions?: string | null | undefined

  nurseId?: string | null | undefined

  stoppedBy?: string | null | undefined
  stoppedAt?: Date | string | null | undefined

  // Optional legacy / tracking fields preserved for DB compatibility
  isStopped?: boolean | undefined
  completedAt?: Date | string | null | undefined
  completedBy?: string | null | undefined
  completionCount?: number | undefined

  isActive: boolean
  isDeleted: boolean
}

export type CareTaskAssignmentCreationAttributes = Optional<
  CareTaskAssignmentAttributes,
  | 'id'
  | 'propertyId'
  | 'packageSubscriptionId'
  | 'carePackageId'
  | 'source'
  | 'billingType'
  | 'price'
  | 'frequency'
  | 'endDate'
  | 'time'
  | 'status'
  | 'customInstructions'
  | 'nurseId'
  | 'stoppedBy'
  | 'stoppedAt'
  | 'isStopped'
  | 'completedAt'
  | 'completedBy'
  | 'completionCount'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class CareTaskAssignment
  extends BaseModel<CareTaskAssignmentAttributes, CareTaskAssignmentCreationAttributes>
  implements CareTaskAssignmentAttributes
{
  declare residentId: string
  declare taskId: string
  declare propertyId: string | null

  declare packageSubscriptionId: string | null
  declare carePackageId: string | null

  declare source: AssignmentSource

  declare billingType: BillingType
  declare price: number

  declare frequency: number | null

  declare startDate: string | Date
  declare endDate: string | Date | null

  declare time: string | null

  declare status: AssignmentStatus

  declare customInstructions: string | null

  declare nurseId: string | null

  declare stoppedBy: string | null
  declare stoppedAt: Date | string | null

  declare isStopped?: boolean
  declare completedAt?: Date | string | null
  declare completedBy?: string | null
  declare completionCount?: number

  declare isActive: boolean
  declare isDeleted: boolean

  declare resident?: Resident
  declare task?: CareTask
  declare property?: Property
  declare nurse?: User
  declare completedByUser?: User
  declare stoppedByUser?: User
  declare charges?: AdditionalTaskCharge[]
  declare packageSubscription?: PackageSubscription
  declare carePackage?: Package
  declare completions?: ResidentCareTaskCompletion[]
}

CareTaskAssignment.init(
  {
    ...baseModelColumns,
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
    nurseId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'FK -> users.id',
    },
    packageSubscriptionId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'FK -> package_subscriptions.id',
    },
    carePackageId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'FK -> packages.id',
    },
    source: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'ADDON',
      comment: 'PACKAGE or ADDON',
    },
    billingType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'SESSION',
      comment: 'MONTHLY or SESSION',
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
    frequency: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1,
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    time: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: '12:00 PM',
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'ACTIVE',
      comment: 'ACTIVE, STOPPED, CANCELLED',
    },
    customInstructions: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isStopped: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    stoppedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    stoppedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    completionCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
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
    tableName: 'care_task_assignments',
    timestamps: true,
  },
)

export default CareTaskAssignment
