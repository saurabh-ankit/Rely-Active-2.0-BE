import type { Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { Op } from 'sequelize'
import {
  RosterAssignmentDate,
  RosterReplacement,
  SchedulingResource,
  User,
  RosterDoctorProfile,
} from '../../../models/index.js'

/**
 * Unified Date Instance Query (Calendar & Grid Engine)
 * GET /api/v1/roster/companies/:companyId/locations/:locationId/roster-dates
 */
export async function getRosterDates(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const companyId = req.params.companyId as string
    const locationId = req.params.locationId as string
    const { startDate, endDate, resourceId, resourceType, status } = req.query

    const isUuid = (val: string) => typeof val === 'string' && /^[0-9a-fA-F-]{36}$/.test(val)

    const whereClause: Record<string, unknown> = {
      isDeleted: false,
    }

    if (isUuid(companyId)) {
      whereClause.companyId = companyId
    }

    if (isUuid(locationId)) {
      whereClause.locationId = locationId
    }

    if (startDate && endDate) {
      whereClause.assignmentDate = {
        [Op.between]: [String(startDate), String(endDate)],
      }
    }

    if (resourceId) {
      whereClause.schedulingResourceId = String(resourceId)
    }

    if (status) {
      whereClause.status = String(status)
    }

    const includeResource: Record<string, unknown>[] = [
      {
        model: SchedulingResource,
        as: 'resource',
        include: [
          { model: User, as: 'user' },
          { model: RosterDoctorProfile, as: 'doctorProfile' },
        ],
      },
      {
        model: SchedulingResource,
        as: 'coveredByResource',
      },
    ]

    if (resourceType && includeResource[0]) {
      includeResource[0].where = { resourceType: String(resourceType) }
    }

    const dates = await RosterAssignmentDate.findAll({
      where: whereClause,
      include: includeResource as any,
      order: [
        ['assignmentDate', 'ASC'],
        ['scheduledStart', 'ASC'],
      ],
    })

    return res.status(200).json({
      success: true,
      count: dates.length,
      data: dates,
    })
  } catch (error) {
    console.error('CRITICAL getRosterDates Error:', error)
    next(error)
  }
}

/**
 * Request Shift Replacement / Coverage
 * POST /api/v1/roster/companies/:companyId/locations/:locationId/roster-dates/:dateId/replace
 */
export async function requestShiftReplacement(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const dateId = req.params.dateId as string
    const { replacementResourceId, reason } = req.body

    const dateInstance = await RosterAssignmentDate.findByPk(dateId)
    if (!dateInstance) {
      return res.status(404).json({ success: false, message: 'Date instance not found.' })
    }

    // 1. Create Replacement Audit Record
    const replacement = await RosterReplacement.create({
      rosterAssignmentDateId: dateInstance.id,
      originalResourceId: dateInstance.schedulingResourceId,
      replacementResourceId: replacementResourceId as string,
      reason: reason as string,
      status: 'APPROVED',
      approvedBy: req.user?.id || 'system',
      approvedAt: new Date(),
      createdBy: req.user?.id || 'system',
      updatedBy: req.user?.id || 'system',
    })

    // 2. Update Date Instance Status & Covered By Resource
    await dateInstance.update({
      status: 'REPLACED',
      coveredByResourceId: replacementResourceId as string,
      updatedBy: req.user?.id || 'system',
    })

    return res.status(200).json({
      success: true,
      message: 'Shift replacement approved and date instance updated.',
      data: {
        dateInstance,
        replacement,
      },
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Non-Destructive Duty Cancellation (P0 Operational Lifecycle)
 * DELETE /api/v1/roster/companies/:companyId/locations/:locationId/roster-dates/:dateId
 */
export async function cancelRosterDate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const dateId = req.params.dateId as string
    const { cancellationReason } = req.body || {}

    const dateInstance = await RosterAssignmentDate.findByPk(dateId)
    if (!dateInstance) {
      return res.status(404).json({ success: false, message: 'Roster date instance not found.' })
    }

    // Perform Non-Destructive Cancellation (Preserves historical operational record)
    await dateInstance.update({
      status: 'CANCELLED',
      cancellationReason: cancellationReason || 'Operational Duty Cancellation',
      cancelledBy: req.user?.id || 'system',
      cancelledAt: new Date(),
      updatedBy: req.user?.id || 'system',
    })

    return res.status(200).json({
      success: true,
      message: 'Roster duty instance transitioned to CANCELLED.',
      data: dateInstance,
    })
  } catch (error) {
    next(error)
  }
}
