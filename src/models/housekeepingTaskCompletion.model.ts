import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export type HousekeepingTaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE'

export interface HousekeepingPhotoAttachment {
  url: string
  key?: string
  contentType?: string
  size?: number
  originalName?: string
  uploadedAt?: string
}

export interface HousekeepingTaskAttachments {
  photos: HousekeepingPhotoAttachment[]
}

export interface HousekeepingTaskCompletionAttributes extends BaseAttributes {
  shiftDateId: string
  employeeId: string
  locationId: string
  status: HousekeepingTaskStatus
  comment?: string | null
  attachments?: HousekeepingTaskAttachments | null
  startedAt?: Date | null
  completedAt?: Date | null
  extraMinutes?: number | null
  isActive: boolean
  isDeleted: boolean
}

export type HousekeepingTaskCompletionCreationAttributes = Optional<
  HousekeepingTaskCompletionAttributes,
  | 'id'
  | 'status'
  | 'comment'
  | 'attachments'
  | 'startedAt'
  | 'completedAt'
  | 'extraMinutes'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class HousekeepingTaskCompletion
  extends BaseModel<HousekeepingTaskCompletionAttributes, HousekeepingTaskCompletionCreationAttributes>
  implements HousekeepingTaskCompletionAttributes
{
  declare shiftDateId: string
  declare employeeId: string
  declare locationId: string
  declare status: HousekeepingTaskStatus
  declare comment: string | null
  declare attachments: HousekeepingTaskAttachments | null
  declare startedAt: Date | null
  declare completedAt: Date | null
  declare extraMinutes: number | null
  declare isActive: boolean
  declare isDeleted: boolean
}

HousekeepingTaskCompletion.init(
  {
    ...baseModelColumns,
    shiftDateId: { type: DataTypes.UUID, allowNull: false },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    locationId: { type: DataTypes.UUID, allowNull: false },
    status: {
      type: DataTypes.ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    comment: { type: DataTypes.TEXT, allowNull: true },
    attachments: { type: DataTypes.JSON, allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    extraMinutes: { type: DataTypes.INTEGER, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, tableName: 'housekeeping_task_completions', timestamps: true },
)

export default HousekeepingTaskCompletion
