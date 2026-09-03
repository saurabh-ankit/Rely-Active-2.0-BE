import type { Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { SchedulingResourceService } from '../../../modules/rosters/domain/scheduling-resource.service.js'
import { resolveCompanyId } from '../../../utils/resolveCompanyId.js'

/**
 * GET /api/v1/roster/companies/:companyId/locations/:locationId/scheduling-resources
 */
export async function getSchedulingResources(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const companyId = await resolveCompanyId(req.params.companyId as string, req.user?.companyId)
    const locationId = req.params.locationId as string
    const departmentId = req.query.departmentId as string | undefined
    const resourceType = req.query.resourceType as 'EMPLOYEE' | 'DOCTOR' | undefined

    const filters: {
      locationId?: string
      departmentId?: string
      resourceType?: 'EMPLOYEE' | 'DOCTOR'
    } = { locationId }
    if (departmentId) filters.departmentId = departmentId
    if (resourceType) filters.resourceType = resourceType

    const resources = await SchedulingResourceService.listResources(companyId, filters)

    const data = resources.map((r) => {
      const profile = r.user?.get('profile') as { firstName?: string; lastName?: string } | undefined
      return {
        id: r.id,
        resourceType: r.resourceType,
        departmentId: r.departmentId,
        userId: r.userId,
        status: r.status,
        name:
          profile?.firstName && profile?.lastName
            ? `${profile.firstName} ${profile.lastName}`
            : r.user?.username || r.user?.email || 'Unknown',
        email: r.user?.email,
      }
    })

    return res.status(200).json({ success: true, data })
  } catch (error) {
    next(error)
  }
}

/**
 * POST /api/v1/roster/companies/:companyId/locations/:locationId/scheduling-resources/sync
 */
export async function syncSchedulingResources(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const companyId = await resolveCompanyId(req.params.companyId as string, req.user?.companyId)
    const locationId = req.params.locationId as string

    const result = await SchedulingResourceService.syncEmployeeResources(
      companyId,
      locationId,
      req.user?.id || 'system',
    )

    return res.status(200).json({
      success: true,
      message: 'Employee scheduling resources synced successfully.',
      data: result,
    })
  } catch (error) {
    next(error)
  }
}
