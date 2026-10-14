import { z } from 'zod'
import { NotificationStatus } from '../enums/notification.enum.js'

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

export type NotificationListQueryInput = z.infer<typeof notificationListQuerySchema>
export type MarkAllNotificationsReadInput = z.infer<typeof markAllNotificationsReadSchema>
