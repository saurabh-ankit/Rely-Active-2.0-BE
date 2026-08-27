import type { NextFunction, Response } from 'express'
import type { AuthenticatedRequest } from './authenticate.js'
import { AuthorizationService } from '../services/authorization.service.js'

export function authorize(permissionCode: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.id) {
        res.status(401).json({
          success: false,
          message: 'Authentication required.',
        })
        return
      }

      const companyId =
        typeof req.query.companyId === 'string'
          ? req.query.companyId
          : (req.body?.companyId as string | undefined) || req.user.companyId || undefined
      const locationId =
        typeof req.query.locationId === 'string'
          ? req.query.locationId
          : (req.body?.locationId as string | undefined) || req.user.defaultLocationId || undefined
      const departmentId =
        typeof req.query.departmentId === 'string'
          ? req.query.departmentId
          : (req.body?.departmentId as string | undefined) || undefined

      const contextScope: {
        companyId?: string | undefined
        locationId?: string | undefined
        departmentId?: string | undefined
      } = {
        companyId,
        locationId,
        departmentId,
      }

      const isAllowed = await AuthorizationService.hasPermission(req.user.id, permissionCode, contextScope)

      if (!isAllowed) {
        res.status(403).json({
          success: false,
          message: `Forbidden: You do not have the required permission (${permissionCode}) to perform this action.`,
        })
        return
      }

      next()
    } catch (err) {
      next(err)
    }
  }
}
