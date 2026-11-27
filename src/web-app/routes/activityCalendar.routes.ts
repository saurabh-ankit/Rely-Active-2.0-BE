import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorizeResource } from '../../middlewares/authorizeResource.js'
import { denyManagers, getActivityCalendarHandler } from '../controllers/activityCalendar.controller.js'

/** Read-only Task Calendar: mounted at /location/:locationId/activity-calendar. */
const activityCalendarRouter = Router({ mergeParams: true })

activityCalendarRouter.use(authenticate, authorizeResource('ACTIVITY_CALENDAR', 'view'), denyManagers)
activityCalendarRouter.get('/', getActivityCalendarHandler)

export default activityCalendarRouter
