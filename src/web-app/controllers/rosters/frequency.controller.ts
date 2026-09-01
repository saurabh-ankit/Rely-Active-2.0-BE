import type { Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { RosterFrequency } from '../../../models/index.js'

/**
 * Create a Frequency Template
 * POST /api/v1/roster/companies/:companyId/locations/:locationId/frequencies
 */
export async function createFrequencyTemplate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const companyId = req.params.companyId as string
    const locationId = req.params.locationId as string
    const { frequencyName, frequencyType, interval, timeUnit, allowedDaysOfWeek, monthlyDays, description } = req.body

    const frequency = await RosterFrequency.create({
      companyId,
      locationId,
      frequencyName: frequencyName as string,
      frequencyType: frequencyType || 'WEEKLY',
      interval: interval || 1,
      timeUnit: timeUnit || 'WEEKS',
      allowedDaysOfWeek: allowedDaysOfWeek || null,
      monthlyDays: monthlyDays || null,
      description: description || null,
      status: 'ACTIVE',
      createdBy: req.user?.id || 'system',
      updatedBy: req.user?.id || 'system',
    })

    return res.status(201).json({
      success: true,
      message: 'Frequency pattern template created successfully.',
      data: frequency,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * List Frequencies for Location
 * GET /api/v1/roster/companies/:companyId/locations/:locationId/frequencies
 */
export async function getFrequencyTemplates(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const companyId = req.params.companyId as string
    const locationId = req.params.locationId as string

    const frequencies = await RosterFrequency.findAll({
      where: { companyId, locationId, isDeleted: false },
      order: [['frequencyName', 'ASC']],
    })

    return res.status(200).json({
      success: true,
      data: frequencies,
    })
  } catch (error) {
    next(error)
  }
}
