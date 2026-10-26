import { Request, Response } from 'express'
import { Op } from 'sequelize'
import {
  GateEntry,
  GateEntryItem,
  GatePreapproved,
  PropertyUnit,
  Resident,
  ResidentFamilyMember,
  User,
  UserDetail,
} from '../../models/index.js'
import { approverFromRequest, gateRaisedByIncludes, raisedByOf } from '../../services/gateApproval.service.js'

/** Staff who checked a visitor in or out, with just enough to show a name. */
const staffInclude = (as: string) => ({
  model: User,
  as,
  attributes: ['id', 'username', 'email'],
  include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
})

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
      include: [
        { model: PropertyUnit, as: 'unit', attributes: ['id', 'unit_number'] },
        staffInclude('clockedInByUser'),
        staffInclude('clockedOutByUser'),
        ...gateRaisedByIncludes(),
        { model: GateEntryItem, as: 'items', attributes: ['id', 'itemName', 'quantity', 'isChecked'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset,
      distinct: true,
    })

    return res.status(200).json({
      success: true,
      data: {
        // raisedBy: the resident behind a pre-approval, or the guard who raised a walk-in.
        rows: rows.map((r) => ({ ...r.toJSON(), raisedBy: raisedByOf(r.toJSON()) })),
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
      include: [
        { model: PropertyUnit, as: 'unit', attributes: ['id', 'unit_number'] },
        // The resident household that pre-approved the visitor, and the family member if one made it.
        { model: Resident, as: 'resident', attributes: ['id', 'firstName', 'lastName'] },
        { model: ResidentFamilyMember, as: 'createdByFamilyMember', attributes: ['id', 'firstName', 'lastName'] },
      ],
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
    const { status, checkedItems } = req.body

    const entry = await GateEntry.findByPk(entryId as string)
    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' })

    // Items the guard ticked off while checking the visitor out.
    if (status === 'Completed' && Array.isArray(checkedItems) && checkedItems.length > 0) {
      await GateEntryItem.update({ isChecked: true }, { where: { entryId: entry.id, id: checkedItems } })
    }

    const updateData: Record<string, unknown> = { status }

    // Record the admin who decided, unless someone already did.
    if ((status === 'Approved' || status === 'Rejected') && !entry.approverType) {
      Object.assign(updateData, await approverFromRequest(req))
    }

    if (status === 'Approved') {
      // If approved from dashboard, auto clock-in as well
      updateData.status = 'Inside'
      if (!entry.clockedInAt) {
        updateData.clockedInAt = new Date()
        // The guard who raised the walk-in lets the visitor in; fall back to the admin approving it.
        updateData.clockedInBy = entry.createdBy || (req as Request & { user?: { id: string } }).user?.id || null
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

/** Adds the items an office visitor is carrying, so the guard can check them off at exit. */
export const addEntryItems = async (req: Request, res: Response) => {
  try {
    const { locId, entryId } = req.params
    const raw: unknown = req.body?.items
    if (!Array.isArray(raw)) return res.status(400).json({ success: false, message: 'items must be an array' })

    const items = raw
      .map((i) => ({
        itemName: typeof i?.itemName === 'string' ? i.itemName.trim() : '',
        quantity: Number(i?.quantity ?? 1),
      }))
      .filter((i) => i.itemName)
    if (items.length === 0) return res.status(400).json({ success: false, message: 'Add at least one item' })
    if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity < 1)) {
      return res.status(400).json({ success: false, message: 'Quantity must be a whole number of at least 1' })
    }
    if (items.some((i) => i.itemName.length > 255)) {
      return res.status(400).json({ success: false, message: 'Item name must be at most 255 characters' })
    }

    const entry = await GateEntry.findOne({ where: { id: entryId as string, locId: locId as string } })
    if (!entry) return res.status(404).json({ success: false, message: 'Entry not found' })
    if (entry.status === 'Completed' || entry.status === 'Rejected') {
      return res.status(400).json({ success: false, message: 'Items cannot be added once the visit has ended' })
    }

    const userId = (req as Request & { user?: { id: string } }).user?.id || null
    const created = await GateEntryItem.bulkCreate(
      items.map((i) => ({ ...i, entryId: entry.id, createdBy: userId, updatedBy: userId })),
    )

    return res.status(201).json({ success: true, data: created })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error adding items', error })
  }
}
