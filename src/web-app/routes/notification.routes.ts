import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { validateBody, validateParams, validateQuery } from '../../middlewares/validate/index.js'
import {
  archiveNotificationItem,
  getNotificationUnreadCount,
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  registerNotificationDevice,
  unregisterNotificationDevice,
} from '../controllers/notification.controller.js'
import {
  markAllNotificationsReadSchema,
  notificationIdParamSchema,
  notificationListQuerySchema,
  registerNotificationDeviceSchema,
  unregisterNotificationDeviceSchema,
} from '../../validations/notification.validation.js'

const notificationRouter = Router()

notificationRouter.use(authenticate)

notificationRouter.get('/', validateQuery(notificationListQuerySchema), getNotifications)
notificationRouter.get('/unread-count', getNotificationUnreadCount)
notificationRouter.post('/devices/register', validateBody(registerNotificationDeviceSchema), registerNotificationDevice)
notificationRouter.post(
  '/devices/unregister',
  validateBody(unregisterNotificationDeviceSchema),
  unregisterNotificationDevice,
)
notificationRouter.patch('/:id/read', validateParams(notificationIdParamSchema), markNotificationAsRead)
notificationRouter.patch('/read-all', validateBody(markAllNotificationsReadSchema), markAllNotificationsAsRead)
notificationRouter.patch('/:id/archive', validateParams(notificationIdParamSchema), archiveNotificationItem)

export default notificationRouter
