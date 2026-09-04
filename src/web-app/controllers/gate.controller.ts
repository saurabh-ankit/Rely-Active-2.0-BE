import { Request, Response } from 'express'
import { Op } from 'sequelize'
import { GateEntry, GatePreapproved, PropertyUnit } from '../../models/index.js'

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const { locId } = req.params

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Expected = Preapproved pending today
    const expected = await GatePreapproved.count({
      where: {
        locId,
        status: 'Pending',
        createdAt: { [Op.gte]: today }, // Simplification, could be startDate
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
    const { page = '1', limit = '10', date, status, visitorType } = req.query

    const pageNum = parseInt(page as string, 10)
    const limitNum = parseInt(limit as string, 10)
    const offset = (pageNum - 1) * limitNum

    const whereClause: Record<string, unknown> = { locId }

    if (status) {
      whereClause.status = status
    }

    if (visitorType) {
      whereClause.visitorType = visitorType
    }

    if (date) {
      const startDate = new Date(date as string)
      startDate.setHours(0, 0, 0, 0)

      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 1)

      whereClause.createdAt = {
        [Op.gte]: startDate,
        [Op.lt]: endDate,
      }
    }

    const { rows, count } = await GateEntry.findAndCountAll({
      where: whereClause,
      include: [{ model: PropertyUnit, as: 'unit', attributes: ['id', 'unit_number'] }],
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset,
    })

    return res.status(200).json({
      success: true,
      data: {
        rows,
        count,
        page: pageNum,
        totalPages: Math.ceil(count / limitNum),
      },
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error fetching entries', error })
  }
}

export const getPreapproved = async (req: Request, res: Response) => {
  try {
    const { locId } = req.params
    const { page = '1', limit = '10', date, status, visitorType } = req.query

    const pageNum = parseInt(page as string, 10)
    const limitNum = parseInt(limit as string, 10)
    const offset = (pageNum - 1) * limitNum

    const whereClause: Record<string, unknown> = { locId }

    if (status) {
      whereClause.status = status
    }

    if (visitorType) {
      whereClause.visitorType = visitorType
    }

    if (date) {
      const startDate = new Date(date as string)
      startDate.setHours(0, 0, 0, 0)

      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 1)

      whereClause.createdAt = {
        [Op.gte]: startDate,
        [Op.lt]: endDate,
      }
    }

    const { rows, count } = await GatePreapproved.findAndCountAll({
      where: whereClause,
      include: [{ model: PropertyUnit, as: 'unit', attributes: ['id', 'unit_number'] }],
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset,
    })

    return res.status(200).json({
      success: true,
      data: {
        rows,
        count,
        page: pageNum,
        totalPages: Math.ceil(count / limitNum),
      },
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error fetching preapproved', error })
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
