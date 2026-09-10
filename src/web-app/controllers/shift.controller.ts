import type { Response } from 'express'
import { Op } from 'sequelize'
import { logger } from '../../config/logger.js'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { ShiftAssignment, ShiftRolePolicy, ShiftSetting, Shift } from '../../models/index.js'
import { asParamString, parseTimeToMinutes } from '../../utils/roster.util.js'
import { errorResponse, successResponse } from '../../utils/response/index.js'

export const getSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    if (!locationId) {
      return res.status(400).json(errorResponse('Location ID is required'))
    }

    const settings = await ShiftSetting.findOne({ where: { locationId } })
    if (!settings) {
      return res.status(200).json(
        successResponse('Roster settings fetched', {
          locationId,
          preShiftBufferMinutes: 60,
          postShiftBufferMinutes: 120,
        }),
      )
    }
    return res.status(200).json(successResponse('Roster settings fetched', settings))
  } catch (error) {
    logger.error({ err: error }, 'getSettings failed')
    return res.status(500).json(errorResponse('Failed to fetch roster settings'))
  }
}

export const updateSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    if (!locationId) {
      return res.status(400).json(errorResponse('Location ID is required'))
    }

    const { preShiftBufferMinutes, postShiftBufferMinutes } = req.body
    const pre = Number(preShiftBufferMinutes)
    const post = Number(postShiftBufferMinutes)

    if (Number.isNaN(pre) || Number.isNaN(post) || pre < 0 || post < 0) {
      return res.status(400).json(errorResponse('Buffer values must be non-negative numbers'))
    }

    const userId = req.user?.id ?? null
    let settings = await ShiftSetting.findOne({ where: { locationId } })

    if (settings) {
      await settings.update({
        preShiftBufferMinutes: pre,
        postShiftBufferMinutes: post,
        updatedBy: userId,
      })
    } else {
      settings = await ShiftSetting.create({
        locationId,
        preShiftBufferMinutes: pre,
        postShiftBufferMinutes: post,
        createdBy: userId,
      })
    }

    return res.status(200).json(successResponse('Roster settings saved successfully', settings))
  } catch (error) {
    logger.error({ err: error }, 'updateSettings failed')
    return res.status(500).json(errorResponse('Failed to save roster settings'))
  }
}

export const getRolePolicies = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    if (!locationId) {
      return res.status(400).json(errorResponse('Location ID is required'))
    }

    const policies = await ShiftRolePolicy.findAll({
      where: { locationId },
      raw: true,
    })

    return res.status(200).json(successResponse('Roster role policies fetched', policies))
  } catch (error) {
    logger.error({ err: error }, 'getRolePolicies failed')
    return res.status(500).json(errorResponse('Failed to fetch role policies'))
  }
}

export const updateRolePolicies = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    if (!locationId) {
      return res.status(400).json(errorResponse('Location ID is required'))
    }

    const { policies } = req.body
    if (!Array.isArray(policies)) {
      return res.status(400).json(errorResponse('Policies must be an array'))
    }

    const userId = req.user?.id ?? null
    const results = []

    for (const policy of policies) {
      const { role, requiresShift, preShiftBufferMinutes, postShiftBufferMinutes, allowCover, allowSwap, allowDayOff } =
        policy

      if (!role) {
        return res.status(400).json(errorResponse('Role is required for each policy item'))
      }

      const preMinutes = preShiftBufferMinutes !== undefined ? Number(preShiftBufferMinutes) : 60
      const postMinutes = postShiftBufferMinutes !== undefined ? Number(postShiftBufferMinutes) : 120

      if (Number.isNaN(preMinutes) || preMinutes < 0 || preMinutes > 10080) {
        return res
          .status(400)
          .json(errorResponse(`Pre-shift buffer for ${role} must be a number between 0 and 10080 minutes (7 days)`))
      }
      if (Number.isNaN(postMinutes) || postMinutes < 0 || postMinutes > 10080) {
        return res
          .status(400)
          .json(errorResponse(`Post-shift buffer for ${role} must be a number between 0 and 10080 minutes (7 days)`))
      }

      const normalizedRole = String(role).toLowerCase()
      let record = await ShiftRolePolicy.findOne({
        where: { locationId, role: normalizedRole },
      })

      const updateData = {
        requiresShift: requiresShift !== undefined ? !!requiresShift : true,
        preShiftBufferMinutes: preMinutes,
        postShiftBufferMinutes: postMinutes,
        allowCover: allowCover !== undefined ? !!allowCover : true,
        allowSwap: allowSwap !== undefined ? !!allowSwap : true,
        allowDayOff: allowDayOff !== undefined ? !!allowDayOff : true,
        updatedBy: userId,
      }

      const beforeData = record
        ? {
            requiresShift: record.requiresShift,
            preShiftBufferMinutes: record.preShiftBufferMinutes,
            postShiftBufferMinutes: record.postShiftBufferMinutes,
            allowCover: record.allowCover,
            allowSwap: record.allowSwap,
            allowDayOff: record.allowDayOff,
          }
        : null

      if (record) {
        await record.update(updateData)
      } else {
        record = await ShiftRolePolicy.create({
          locationId,
          role: normalizedRole,
          ...updateData,
          createdBy: userId,
        })
      }

      logger.info({
        event: 'ROSTER_POLICY_UPDATED',
        locationId,
        role: normalizedRole,
        changedBy: userId,
        before: beforeData,
        after: updateData,
      })

      results.push(record)
    }

    return res.status(200).json(successResponse('Roster role policies saved successfully', results))
  } catch (error) {
    logger.error({ err: error }, 'updateRolePolicies failed')
    return res.status(500).json(errorResponse('Failed to save role policies'))
  }
}

export const listShifts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    const shifts = await Shift.findAll({
      where: { isDeleted: false, locationId },
      order: [['createdAt', 'ASC']],
    })

    const shiftsWithAssignments = await Promise.all(
      shifts.map(async (shift) => {
        const count = await ShiftAssignment.count({
          where: { shiftId: shift.id, isDeleted: false },
        })
        return {
          ...shift.toJSON(),
          isAssigned: count > 0,
          assignmentCount: count,
        }
      }),
    )

    return res.status(200).json(successResponse('Shifts fetched', { shifts: shiftsWithAssignments }))
  } catch (error) {
    logger.error({ err: error }, 'listShifts failed')
    return res.status(500).json(errorResponse('Failed to fetch shifts'))
  }
}

export const getShift = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = asParamString(req.params.id)
    const shift = await Shift.findOne({ where: { id, isDeleted: false } })
    if (!shift) return res.status(404).json(errorResponse('Shift not found'))
    return res.status(200).json(successResponse('Shift fetched', shift))
  } catch (error) {
    logger.error({ err: error }, 'getShift failed')
    return res.status(500).json(errorResponse('Failed to fetch shift'))
  }
}

export const createShift = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    const { name, description, startTime, endTime, slotGenerationMode, slotDuration, numberOfSlots } = req.body

    if (!startTime || !endTime) {
      return res.status(400).json(errorResponse('Start time and end time are required'))
    }
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      return res.status(400).json(errorResponse('Invalid time format. Use HH:mm'))
    }
    if (parseTimeToMinutes(startTime) === null || parseTimeToMinutes(endTime) === null) {
      return res.status(400).json(errorResponse('Invalid time values'))
    }

    const sameName = await Shift.findOne({
      where: { locationId, name: { [Op.like]: name }, isDeleted: false },
    })
    if (sameName) {
      return res.status(400).json(errorResponse('Shift name already exists for this location'))
    }

    const createdBy = req.user?.id ?? null
    const shift = await Shift.create({
      name,
      description: description ?? '',
      startTime,
      endTime,
      locationId,
      ...(slotGenerationMode !== undefined ? { slotGenerationMode } : {}),
      ...(slotDuration !== undefined ? { slotDuration: slotDuration ? Number(slotDuration) : null } : {}),
      ...(numberOfSlots !== undefined ? { numberOfSlots: numberOfSlots ? Number(numberOfSlots) : null } : {}),
      createdBy,
    })
    return res.status(201).json(successResponse('Shift created', shift))
  } catch (error) {
    logger.error({ err: error }, 'createShift failed')
    return res.status(500).json(errorResponse('Failed to create shift'))
  }
}

export const updateShift = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = asParamString(req.params.id)
    const locationId = asParamString(req.params.locationId)
    const payload = req.body as Partial<Shift> & {
      startTime?: string
      endTime?: string
      description?: string | null
    }

    if (payload.startTime && !/^\d{2}:\d{2}$/.test(payload.startTime)) {
      return res.status(400).json(errorResponse('Invalid time format. Use HH:mm'))
    }
    if (payload.endTime && !/^\d{2}:\d{2}$/.test(payload.endTime)) {
      return res.status(400).json(errorResponse('Invalid time format. Use HH:mm'))
    }
    if (payload.startTime && parseTimeToMinutes(payload.startTime) === null) {
      return res.status(400).json(errorResponse('Invalid start time value'))
    }
    if (payload.endTime && parseTimeToMinutes(payload.endTime) === null) {
      return res.status(400).json(errorResponse('Invalid end time value'))
    }

    const shift = await Shift.findOne({ where: { id, isDeleted: false } })
    if (!shift) return res.status(404).json(errorResponse('Shift not found'))

    const nextStart = payload.startTime ?? shift.startTime
    const nextEnd = payload.endTime ?? shift.endTime
    if (!nextStart || !nextEnd) {
      return res.status(400).json(errorResponse('Start time and end time are required'))
    }

    const updatedBy = req.user?.id ?? null
    const { description, ...rest } = payload
    await shift.update({
      ...rest,
      ...(description !== undefined ? { description: description ?? '' } : {}),
      locationId,
      updatedBy,
    })
    return res.status(200).json(successResponse('Shift updated', shift))
  } catch (error) {
    logger.error({ err: error }, 'updateShift failed')
    return res.status(500).json(errorResponse('Failed to update shift'))
  }
}

export const deleteShift = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = asParamString(req.params.id)
    const shift = await Shift.findOne({ where: { id, isDeleted: false } })
    if (!shift) return res.status(404).json(errorResponse('Shift not found'))

    const assignmentCount = await ShiftAssignment.count({
      where: { shiftId: id, isDeleted: false },
    })

    if (assignmentCount > 0) {
      return res
        .status(400)
        .json(errorResponse('Cannot delete shift because it is currently assigned to one or more employees.'))
    }

    await shift.update({ isDeleted: true, updatedBy: req.user?.id ?? null })
    return res.status(200).json(successResponse('Shift deleted'))
  } catch (error) {
    logger.error({ err: error }, 'deleteShift failed')
    return res.status(500).json(errorResponse('Failed to delete shift'))
  }
}
