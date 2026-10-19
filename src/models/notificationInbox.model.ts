import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { NotificationChannel, NotificationRecipientType, NotificationStatus } from '../enums/notification.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

import type { NotificationEvent } from './notificationEvent.model.js'

export interface NotificationInboxAttributes extends BaseAttributes {
  eventId: string
  recipientType: NotificationRecipientType | string
  recipientUserId?: string | null
  recipientResidentId?: string | null
  recipientFamilyMemberId?: string | null
  channel: NotificationChannel | string
  status: NotificationStatus | string
  deliveredAt: Date
  readAt?: Date | null
  archivedAt?: Date | null
}

export type NotificationInboxCreationAttributes = Optional<
  NotificationInboxAttributes,
  | 'id'
  | 'recipientUserId'
  | 'recipientResidentId'
  | 'recipientFamilyMemberId'
  | 'channel'
  | 'status'
  | 'deliveredAt'
  | 'readAt'
  | 'archivedAt'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class NotificationInbox
  extends BaseModel<NotificationInboxAttributes, NotificationInboxCreationAttributes>
  implements NotificationInboxAttributes
{
  declare eventId: string
  declare recipientType: NotificationRecipientType | string
  declare recipientUserId: string | null
  declare recipientResidentId: string | null
  declare recipientFamilyMemberId: string | null
  declare channel: NotificationChannel | string
  declare status: NotificationStatus | string
  declare deliveredAt: Date
  declare readAt: Date | null
  declare archivedAt: Date | null

  declare event?: NotificationEvent
}

NotificationInbox.init(
  {
    ...baseModelColumns,
    eventId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    recipientType: {
      type: DataTypes.ENUM(...Object.values(NotificationRecipientType)),
      allowNull: false,
    },
    recipientUserId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    recipientResidentId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    recipientFamilyMemberId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    channel: {
      type: DataTypes.ENUM(...Object.values(NotificationChannel)),
      allowNull: false,
      defaultValue: NotificationChannel.IN_APP,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(NotificationStatus)),
      allowNull: false,
      defaultValue: NotificationStatus.UNREAD,
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    archivedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'notification_inbox',
    timestamps: true,
  },
)

export default NotificationInbox
