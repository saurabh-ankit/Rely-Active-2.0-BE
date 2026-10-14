import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import {
  NotificationAppSurface,
  NotificationDevicePlatform,
  NotificationRecipientType,
} from '../enums/notification.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface NotificationDeviceTokenAttributes extends BaseAttributes {
  recipientType: NotificationRecipientType | string
  recipientUserId?: string | null
  recipientResidentId?: string | null
  recipientFamilyMemberId?: string | null
  appSurface: NotificationAppSurface | string
  platform: NotificationDevicePlatform | string
  deviceId?: string | null
  fcmToken: string
  appVersion?: string | null
  isActive: boolean
  lastRegisteredAt: Date
  lastSeenAt: Date
  invalidatedAt?: Date | null
  invalidationReason?: string | null
}

export type NotificationDeviceTokenCreationAttributes = Optional<
  NotificationDeviceTokenAttributes,
  | 'id'
  | 'recipientUserId'
  | 'recipientResidentId'
  | 'recipientFamilyMemberId'
  | 'platform'
  | 'deviceId'
  | 'appVersion'
  | 'isActive'
  | 'lastRegisteredAt'
  | 'lastSeenAt'
  | 'invalidatedAt'
  | 'invalidationReason'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class NotificationDeviceToken
  extends BaseModel<NotificationDeviceTokenAttributes, NotificationDeviceTokenCreationAttributes>
  implements NotificationDeviceTokenAttributes
{
  declare recipientType: NotificationRecipientType | string
  declare recipientUserId: string | null
  declare recipientResidentId: string | null
  declare recipientFamilyMemberId: string | null
  declare appSurface: NotificationAppSurface | string
  declare platform: NotificationDevicePlatform | string
  declare deviceId: string | null
  declare fcmToken: string
  declare appVersion: string | null
  declare isActive: boolean
  declare lastRegisteredAt: Date
  declare lastSeenAt: Date
  declare invalidatedAt: Date | null
  declare invalidationReason: string | null
}

NotificationDeviceToken.init(
  {
    ...baseModelColumns,
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
    appSurface: {
      type: DataTypes.ENUM(...Object.values(NotificationAppSurface)),
      allowNull: false,
    },
    platform: {
      type: DataTypes.ENUM(...Object.values(NotificationDevicePlatform)),
      allowNull: false,
      defaultValue: NotificationDevicePlatform.WEB,
    },
    deviceId: {
      type: DataTypes.STRING(191),
      allowNull: true,
    },
    fcmToken: {
      type: DataTypes.STRING(512),
      allowNull: false,
      unique: true,
    },
    appVersion: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    lastRegisteredAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    invalidatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    invalidationReason: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'notification_device_tokens',
    timestamps: true,
  },
)

export default NotificationDeviceToken
