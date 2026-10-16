import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import {
  NotificationActionType,
  NotificationActorType,
  NotificationModule,
  NotificationSeverity,
} from '../enums/notification.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

import type { NotificationInbox } from './notificationInbox.model.js'

export interface NotificationEventAttributes extends BaseAttributes {
  module: NotificationModule | string
  eventCode: string
  entityType: string
  entityId: string
  entityLabel?: string | null
  companyId?: string | null
  locationId?: string | null
  actorType?: NotificationActorType | string | null
  actorUserId?: string | null
  actorResidentId?: string | null
  actorFamilyMemberId?: string | null
  actorName?: string | null
  title: string
  message: string
  actionType?: NotificationActionType | string
  actionValue?: string | null
  severity?: NotificationSeverity | string
  payload?: Record<string, unknown> | null
  dedupeKey?: string | null
  occurredAt: Date
}

export type NotificationEventCreationAttributes = Optional<
  NotificationEventAttributes,
  | 'id'
  | 'entityLabel'
  | 'companyId'
  | 'locationId'
  | 'actorType'
  | 'actorUserId'
  | 'actorResidentId'
  | 'actorFamilyMemberId'
  | 'actorName'
  | 'actionType'
  | 'actionValue'
  | 'severity'
  | 'payload'
  | 'dedupeKey'
  | 'occurredAt'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class NotificationEvent
  extends BaseModel<NotificationEventAttributes, NotificationEventCreationAttributes>
  implements NotificationEventAttributes
{
  declare module: NotificationModule | string
  declare eventCode: string
  declare entityType: string
  declare entityId: string
  declare entityLabel: string | null
  declare companyId: string | null
  declare locationId: string | null
  declare actorType: NotificationActorType | string | null
  declare actorUserId: string | null
  declare actorResidentId: string | null
  declare actorFamilyMemberId: string | null
  declare actorName: string | null
  declare title: string
  declare message: string
  declare actionType: NotificationActionType | string
  declare actionValue: string | null
  declare severity: NotificationSeverity | string
  declare payload: Record<string, unknown> | null
  declare dedupeKey: string | null
  declare occurredAt: Date

  declare recipients?: NotificationInbox[]
}

NotificationEvent.init(
  {
    ...baseModelColumns,
    // This is for the future scale we can extend it to.
    module: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    eventCode: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    entityType: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    entityId: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    entityLabel: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    companyId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    actorType: {
      type: DataTypes.ENUM(...Object.values(NotificationActorType)),
      allowNull: true,
    },
    actorUserId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    actorResidentId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    actorFamilyMemberId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    actorName: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    actionType: {
      type: DataTypes.ENUM(...Object.values(NotificationActionType)),
      allowNull: false,
      defaultValue: NotificationActionType.OPEN_ENTITY,
    },
    actionValue: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    severity: {
      type: DataTypes.ENUM(...Object.values(NotificationSeverity)),
      allowNull: false,
      defaultValue: NotificationSeverity.INFO,
    },
    payload: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    dedupeKey: {
      type: DataTypes.STRING(191),
      allowNull: true,
      unique: true,
    },
    occurredAt: {
      // Millisecond precision so notifications raised in the same second stay in order
      type: DataTypes.DATE(3),
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'notification_events',
    timestamps: true,
  },
)

export default NotificationEvent
