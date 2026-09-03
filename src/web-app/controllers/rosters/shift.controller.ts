import type { Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { RosterShift } from '../../../models/index.js'
import { resolveCompanyId } from '../../../utils/resolveCompanyId.js'

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
      departmentId,
      shiftCategory,
    } = req.body

    const shift = await RosterShift.create({
      companyId,
      locationId,
      departmentId: departmentId || null,
      shiftCategory: shiftCategory || (departmentId ? 'DEPARTMENT' : 'GENERAL'),
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

export async function getShiftTemplates(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const companyId = await resolveCompanyId(req.params.companyId as string, req.user?.companyId)
    const locationId = req.params.locationId as string
    const departmentId = req.query.departmentId as string | undefined
    const shiftCategory = req.query.shiftCategory as string | undefined

    const where: Record<string, unknown> = { companyId, locationId, isDeleted: false }
    if (departmentId) where.departmentId = departmentId
    if (shiftCategory) where.shiftCategory = shiftCategory

    const shifts = await RosterShift.findAll({
      where,
      order: [['startTime', 'ASC']],
    })

    return res.status(200).json({ success: true, data: shifts })
  } catch (error) {
    next(error)
  }
}

export async function updateShiftTemplate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const companyId = await resolveCompanyId(req.params.companyId as string, req.user?.companyId)
    const locationId = req.params.locationId as string
    const shiftId = req.params.shiftId as string
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
      departmentId,
      shiftCategory,
    } = req.body

    const shift = await RosterShift.findOne({
      where: { id: shiftId, companyId, locationId, isDeleted: false },
    })

    if (!shift) {
      return res.status(404).json({ success: false, message: 'Shift master template not found.' })
    }

    await shift.update({
      shiftName: shiftName as string,
      code: (code as string) || (shiftName as string).toUpperCase().replace(/\s+/g, '_'),
      description: description ?? null,
      startTime: startTime as string,
      endTime: endTime as string,
      breakStartTime: breakStartTime || null,
      breakEndTime: breakEndTime || null,
      slotGenerationMode: slotGenerationMode || shift.slotGenerationMode,
      slotDurationMinutes: slotDurationMinutes ?? shift.slotDurationMinutes,
      numberOfSlots: numberOfSlots ?? null,
      departmentId: departmentId !== undefined ? departmentId : shift.departmentId,
      shiftCategory: shiftCategory || shift.shiftCategory,
      updatedBy: req.user?.id || 'system',
    })

    return res.status(200).json({
      success: true,
      message: 'Shift master template updated successfully.',
      data: shift,
    })
  } catch (error) {
    next(error)
  }
}
