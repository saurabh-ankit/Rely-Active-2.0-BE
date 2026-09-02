import { Request, Response } from 'express'
import { Op } from 'sequelize'
import { GateEntry, GateInvite, PropertyUnit } from '../../models/index.js'

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const { locId } = req.params

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Expected = Invites pending today
    const expected = await GateInvite.count({
      where: {
        locId,
        status: 'Pending',
        createdAt: { [Op.gte]: today }, // Simplification, could be expectedDate
      },
    })

    // Currently Inside
    const currentlyInside = await GateEntry.count({
      where: { locId, status: 'Inside' },
    })

    // Completed
    const completed = await GateEntry.count({
      where: { locId, status: 'Completed', createdAt: { [Op.gte]: today } },
    })

    // Pending Walk-ins
    const pendingWalkins = await GateEntry.count({
      where: { locId, status: 'PendingApproval', entrySource: 'Walkin' },
    })

    // Rejected
    const rejected = await GateEntry.count({
      where: { locId, status: 'Rejected' },
    })

    // Total Entries today (Inside + Completed)
    const totalEntries = currentlyInside + completed

    return res.status(200).json({
      success: true,
      data: {
        totalEntries,
        expected,
        currentlyInside,
        completed,
        pendingWalkins,
        rejected,
      },
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error fetching stats', error })
  }
}

export const getEntries = async (req: Request, res: Response) => {
  try {
    const { locId } = req.params
    const entries = await GateEntry.findAll({
      where: { locId },
      include: [{ model: PropertyUnit, as: 'unit', attributes: ['id', 'unit_number'] }],
      order: [['createdAt', 'DESC']],
    })
    return res.status(200).json({ success: true, data: entries })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error fetching entries', error })
  }
}

export const getInvites = async (req: Request, res: Response) => {
  try {
    const { locId } = req.params
    const invites = await GateInvite.findAll({
      where: { locId },
      include: [{ model: PropertyUnit, as: 'unit', attributes: ['id', 'unit_number'] }],
      order: [['createdAt', 'DESC']],
    })
    return res.status(200).json({ success: true, data: invites })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error fetching invites', error })
  }
}

export const updateEntryStatus = async (req: Request, res: Response) => {
  try {
    const { entryId } = req.params
    const { status } = req.body

    const entry = await GateEntry.findByPk(entryId as string)
    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' })

    const updateData: Record<string, unknown> = { status }

    if (status === 'Approved') {
      // If approved from dashboard, auto clock-in as well
      updateData.status = 'Inside'
      if (!entry.clockedInAt) {
        updateData.clockedInAt = new Date()
        updateData.clockedInBy = (req as Request & { user?: { id: string } }).user?.id || null
      }
    } else if (status === 'Completed' && !entry.clockedOutAt) {
      updateData.clockedOutAt = new Date()
      updateData.clockedOutBy = (req as Request & { user?: { id: string } }).user?.id || null
    } else if (status === 'Inside' && !entry.clockedInAt) {
      updateData.clockedInAt = new Date()
      updateData.clockedInBy = (req as Request & { user?: { id: string } }).user?.id || null
    }

    await entry.update(updateData)

    return res.status(200).json({ success: true, data: entry })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error updating entry', error })
  }
}
