import { z } from 'zod'
import { NotificationAppSurface, NotificationDevicePlatform, NotificationStatus } from '../enums/notification.enum.js'

export const notificationIdParamSchema = z.object({
  id: z.string().uuid('Valid notification ID is required'),
})

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum([NotificationStatus.UNREAD, NotificationStatus.READ, NotificationStatus.ARCHIVED, 'ALL'])
    .default('ALL'),
  module: z.string().trim().max(64).optional(),
})

export const markAllNotificationsReadSchema = z.object({
  module: z.string().trim().max(64).optional(),
})

export const registerNotificationDeviceSchema = z.object({
  fcmToken: z.string().trim().min(20, 'Valid fcmToken is required').max(2048),
  appSurface: z.enum([
    NotificationAppSurface.WEB_APP,
    NotificationAppSurface.MOBILE_L1,
    NotificationAppSurface.MOBILE_L3,
  ]),
  platform: z
    .enum([NotificationDevicePlatform.WEB, NotificationDevicePlatform.ANDROID, NotificationDevicePlatform.IOS])
    .optional(),
  deviceId: z.string().trim().max(191).optional(),
  appVersion: z.string().trim().max(64).optional(),
})

export const unregisterNotificationDeviceSchema = z.object({
  fcmToken: z.string().trim().min(20, 'Valid fcmToken is required').max(2048),
  reason: z.string().trim().max(128).optional(),
})

export type NotificationListQueryInput = z.infer<typeof notificationListQuerySchema>
export type MarkAllNotificationsReadInput = z.infer<typeof markAllNotificationsReadSchema>
export type RegisterNotificationDeviceInput = z.infer<typeof registerNotificationDeviceSchema>
export type UnregisterNotificationDeviceInput = z.infer<typeof unregisterNotificationDeviceSchema>
