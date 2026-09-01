import type { Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { RosterShift } from '../../../models/index.js'
import { resolveCompanyId } from '../../../utils/resolveCompanyId.js'

/**
 * Create a Shift Master Template
 * POST /api/v1/roster/companies/:companyId/locations/:locationId/shifts
 */
export async function createShiftTemplate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const companyId = await resolveCompanyId(req.params.companyId as string, req.user?.companyId)
    const locationId = req.params.locationId as string
    const {
      shiftName,
      code,
      description,
      startTime,
      endTime,
      breakStartTime,
      breakEndTime,
      slotGenerationMode,
      slotDurationMinutes,
      numberOfSlots,
    } = req.body

    const shift = await RosterShift.create({
      companyId,
      locationId,
      shiftName: shiftName as string,
      code: (code as string) || (shiftName as string).toUpperCase().replace(/\s+/g, '_'),
      description: description || null,
      startTime: startTime as string,
      endTime: endTime as string,
      breakStartTime: breakStartTime || null,
      breakEndTime: breakEndTime || null,
      slotGenerationMode: slotGenerationMode || 'AUTO_GENERATE',
      slotDurationMinutes: slotDurationMinutes || 60,
      numberOfSlots: numberOfSlots || null,
      status: 'ACTIVE',
      createdBy: req.user?.id || 'system',
      updatedBy: req.user?.id || 'system',
    })

    return res.status(201).json({
      success: true,
      message: 'Shift master template created successfully.',
      data: shift,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * List Shift Master Templates for Location
 * GET /api/v1/roster/companies/:companyId/locations/:locationId/shifts
 */
export async function getShiftTemplates(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const companyId = await resolveCompanyId(req.params.companyId as string, req.user?.companyId)
    const locationId = req.params.locationId as string

    const shifts = await RosterShift.findAll({
      where: { companyId, locationId, isDeleted: false },
      order: [['startTime', 'ASC']],
    })

    return res.status(200).json({
      success: true,
      data: shifts,
    })
  } catch (error) {
    next(error)
  }
}
