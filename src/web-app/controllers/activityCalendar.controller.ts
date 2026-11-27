import type { NextFunction, Response } from 'express'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { AuthorizationService } from '../../services/authorization.service.js'
import { getPermissionSet } from '../../services/permission.service.js'
import {
  CALENDAR_CATEGORIES,
  MAX_RANGE_DAYS,
  daysBetween,
  getActivityCalendar,
  isYmd,
  type CalendarCategory,
} from '../../services/activityCalendar.service.js'
import { errorResponse, successResponse } from '../../utils/response/index.js'

/** Department Managers never see the Task Calendar, even when it is granted to them. */
export const denyManagers = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json(errorResponse('User not authenticated'))
    const ctx = await AuthorizationService.getUserAuthorizationContext(userId)
    if (ctx.isSuperAdmin) return next()
    const locationId = req.params.locationId
    const isManagerHere = ctx.scopes.some(
      (s) => s.roleCode === 'MANAGER' && (!s.locationId || s.locationId === locationId),
    )
    if (isManagerHere) {
      return res.status(403).json(errorResponse('The Task Calendar is not available to Department Managers.'))
    }
    return next()
  } catch (err) {
    return next(err)
  }
}

const CATEGORY_KEYS = new Set<string>(CALENDAR_CATEGORIES.map((c) => c.key))

/**
 * GET /location/:locationId/activity-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD[&categories=a,b]
 * Read-only. A single-day range returns every item; longer ranges return per-day
 * counts for the high-volume categories.
 */
export const getActivityCalendarHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = req.params.locationId as string
    const { from, to } = req.query
    if (!isYmd(from) || !isYmd(to)) {
      return res.status(400).json(errorResponse('from and to are required as YYYY-MM-DD'))
    }
    const span = daysBetween(from, to)
    if (span < 0) return res.status(400).json(errorResponse('to must be on or after from'))
    if (span >= MAX_RANGE_DAYS) {
      return res.status(400).json(errorResponse(`The range can be at most ${MAX_RANGE_DAYS} days`))
    }

    let categories: CalendarCategory[] | null = null
    if (typeof req.query.categories === 'string' && req.query.categories.trim()) {
      categories = req.query.categories
        .split(',')
        .map((c) => c.trim())
        .filter((c): c is CalendarCategory => CATEGORY_KEYS.has(c))
    }

    const perms = await getPermissionSet(req.user!.id, locationId)
    const data = await getActivityCalendar({ locationId, from, to, categories, perms })
    return res.status(200).json(successResponse('Task calendar fetched successfully', data))
  } catch (error) {
    console.error('Get Activity Calendar Error:', error)
    return res.status(500).json(errorResponse('Failed to fetch the task calendar'))
  }
}
