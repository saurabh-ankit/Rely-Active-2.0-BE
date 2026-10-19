import { z } from 'zod'
import { NotificationDevicePlatform } from '../enums/notification.enum.js'

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  fcmToken: z.string().trim().max(2048).optional(),
  deviceId: z.string().trim().max(191).optional(),
  platform: z
    .enum([NotificationDevicePlatform.WEB, NotificationDevicePlatform.ANDROID, NotificationDevicePlatform.IOS])
    .optional(),
  appVersion: z.string().trim().max(64).optional(),
})

export type LoginInput = z.infer<typeof loginSchema>
