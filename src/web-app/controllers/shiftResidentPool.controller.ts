import type { Response } from 'express'
import { logger } from '../../config/logger.js'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { ShiftAssignment, Resident, ShiftDate, ShiftResidentPool, Shift, User, UserDetail } from '../../models/index.js'
import { asParamString } from '../../utils/roster.util.js'
import { errorResponse, successResponse } from '../../utils/response/index.js'

export const createShiftResidentPool = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    const { shiftEmployeeDateId, residentId, fromTime, toTime, notes } = req.body
    const createdBy = req.user?.id ?? null

    if (!shiftEmployeeDateId || !residentId) {
      return res.status(400).json(errorResponse('Missing shiftEmployeeDateId or residentId'))
    }

    const shiftDate = await ShiftDate.findOne({
      where: { id: shiftEmployeeDateId, locationId, isDeleted: false },
    })
    if (!shiftDate) {
      return res.status(404).json(errorResponse('Shift employee date not found'))
    }

    const resident = await Resident.findOne({
      where: { id: residentId, locId: locationId, isDeleted: false },
    })
    if (!resident) {
      return res.status(404).json(errorResponse('Resident not found at this location'))
    }

    const existing = await ShiftResidentPool.findOne({
      where: { shiftEmployeeDateId, residentId, isDeleted: false },
    })
    if (existing) {
      return res.status(400).json(errorResponse('Resident already assigned to this shift date'))
    }

    const poolEntry = await ShiftResidentPool.create({
      shiftEmployeeDateId,
      residentId,
      fromTime,
      toTime,
      notes,
      locationId,
      createdBy,
      updatedBy: createdBy,
    })

    return res.status(201).json(successResponse('Resident added to shift pool', poolEntry))
  } catch (error) {
    logger.error({ err: error }, 'createShiftResidentPool failed')
    return res.status(500).json(errorResponse('Failed to add resident to shift pool'))
  }
}

export const listShiftResidentPool = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    const { shiftEmployeeDateId, residentId, date } = req.query

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { locationId, isDeleted: false }
    if (shiftEmployeeDateId) where.shiftEmployeeDateId = shiftEmployeeDateId
    if (residentId) where.residentId = residentId

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dateWhere: any = { isDeleted: false }
    if (date) dateWhere.date = date

    const poolEntries = await ShiftResidentPool.findAll({
      where,
      include: [
        {
          model: Resident,
          as: 'resident',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'unitId'],
        },
        {
          model: ShiftDate,
          as: 'shiftEmployeeDate',
          where: dateWhere,
          required: true,
          include: [
            {
              model: ShiftAssignment,
              as: 'shiftAssignment',
              include: [
                {
                  model: User,
                  as: 'employee',
                  attributes: ['id', 'email', 'username'],
                  include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
                },
                {
                  model: Shift,
                  as: 'shift',
                  attributes: ['id', 'name', 'startTime', 'endTime'],
                },
              ],
            },
            {
              model: User,
              as: 'coveringEmployee',
              attributes: ['id', 'email', 'username'],
              include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
            },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
    })

    return res.status(200).json(successResponse('Shift resident pool entries fetched', poolEntries))
  } catch (error) {
    logger.error({ err: error }, 'listShiftResidentPool failed')
    return res.status(500).json(errorResponse('Failed to fetch shift resident pool entries'))
  }
}

export const deleteShiftResidentPool = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const poolId = asParamString(req.params.poolId)
    const locationId = asParamString(req.params.locationId)
    const updatedBy = req.user?.id ?? null

    const entry = await ShiftResidentPool.findOne({
      where: { id: poolId, locationId, isDeleted: false },
    })
    if (!entry) {
      return res.status(404).json(errorResponse('Shift resident pool entry not found'))
    }

    await entry.update({
      isDeleted: true,
      isActive: false,
      updatedBy,
    })

    return res.status(200).json(successResponse('Resident removed from shift pool', { id: poolId }))
  } catch (error) {
    logger.error({ err: error }, 'deleteShiftResidentPool failed')
    return res.status(500).json(errorResponse('Failed to remove resident from shift pool'))
  }
}
