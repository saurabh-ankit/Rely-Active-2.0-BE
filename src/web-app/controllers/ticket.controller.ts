import type { Request, Response } from 'express'
import { Op } from 'sequelize'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import {
  Ticket,
  TicketActivityLog,
  TicketCategory,
  TicketSubCategory,
  Property,
  PropertyBlock,
  PropertyFloor,
  PropertyUnit,
  Resident,
  Department,
  JobCategory,
  User,
  UserLocation,
  AssetVendor,
  Asset,
} from '../../models/index.js'
import { TicketActivityType, TicketPriority, TicketStatus } from '../../enums/ticket.enum.js'
import { uploadFileToS3 } from '../../middlewares/s3/index.js'

/**
 * Fetch master ticket categories and sub-categories
 */
export async function getCategoriesAndSubCategories(_req: Request, res: Response): Promise<void> {
  try {
    let categories = await TicketCategory.findAll({
      where: { isActive: true },
      include: [{ model: TicketSubCategory, as: 'subCategories', where: { isActive: true }, required: false }],
      order: [
        ['name', 'ASC'],
        [{ model: TicketSubCategory, as: 'subCategories' }, 'name', 'ASC'],
      ],
    })

    // Seed default categories if none exist in DB
    if (categories.length === 0) {
      await TicketCategory.create({ name: 'Rely Advantage Service', code: 'RELY_ADVANTAGE' })
      const cat2 = await TicketCategory.create({ name: 'Common Area Maintenance', code: 'COMMON_MAINTENANCE' })

      await TicketSubCategory.bulkCreate([
        { categoryId: cat2.id, name: 'Electrical Maintenance', code: 'ELECTRICAL' },
        { categoryId: cat2.id, name: 'Plumbing Maintenance', code: 'PLUMBING' },
        { categoryId: cat2.id, name: 'Carpentry Maintenance', code: 'CARPENTRY' },
        { categoryId: cat2.id, name: 'Miscellaneous Maintenance', code: 'MISC' },
      ])

      categories = await TicketCategory.findAll({
        where: { isActive: true },
        include: [{ model: TicketSubCategory, as: 'subCategories', where: { isActive: true }, required: false }],
      })
    }

    res.status(200).json({
      success: true,
      data: categories,
    })
  } catch (error) {
    console.error('Error fetching ticket categories:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch categories' })
  }
}

/**
 * Fetch units for a property location
 */
export async function getPropertyUnitsForLocation(req: Request, res: Response): Promise<void> {
  try {
    const locId = (req.query.locId || req.query.locationId || req.params.locationId) as string | undefined
    if (!locId) {
      res.status(200).json({ success: true, data: [] })
      return
    }

    const units = await PropertyUnit.findAll({
      include: [
        {
          model: PropertyFloor,
          as: 'floor',
          required: false,
          include: [
            {
              model: PropertyBlock,
              as: 'block',
              where: { propertyId: locId },
              required: false,
            },
          ],
        },
        {
          model: Resident,
          as: 'residents',
          attributes: ['id', 'firstName', 'lastName', 'phone', 'email'],
          required: false,
        },
      ],
      order: [['unitNumber', 'ASC']],
    })

    res.status(200).json({
      success: true,
      data: units,
    })
  } catch (error) {
    console.error('Error fetching property units:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch property units' })
  }
}

/**
 * Fetch employees matching department & job category with workload metrics
 */
export async function getAssignableEmployees(req: Request, res: Response): Promise<void> {
  try {
    const locId = (req.query.locId || req.query.locationId || req.params.locationId) as string | undefined
    const { departmentId, jobCategoryId } = req.query

    const userLocWhere: Record<string, unknown> = {}
    if (locId) userLocWhere.locId = locId
    if (departmentId) userLocWhere.departmentId = departmentId
    if (jobCategoryId) userLocWhere.jobCategoryId = jobCategoryId

    // Find users associated with the given property/department/jobCategory
    const userLocations = (await UserLocation.findAll({
      where: userLocWhere,
      include: [{ model: User, as: 'user', attributes: ['id', 'email'] }],
    })) as unknown as Array<{ user?: { id: string; email: string | null } }>

    // Deduplicate user list
    const userMap = new Map<string, { id: string; email: string }>()
    for (const ul of userLocations) {
      if (ul.user) {
        userMap.set(ul.user.id, { id: ul.user.id, email: ul.user.email || 'user@rely.com' })
      }
    }

    // Fallback: If no location filter matched, fetch active staff users
    if (userMap.size === 0) {
      const allUsers = await User.findAll({ limit: 20, attributes: ['id', 'email'] })
      for (const u of allUsers) {
        userMap.set(u.id, { id: u.id, email: u.email || 'user@rely.com' })
      }
    }

    const employeesWithMetrics = await Promise.all(
      Array.from(userMap.values()).map(async (u) => {
        const totalAssigned = await Ticket.count({ where: { assignedToUserId: u.id } })
        const openCount = await Ticket.count({
          where: {
            assignedToUserId: u.id,
            status: { [Op.in]: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD] },
          },
        })
        const closedCount = await Ticket.count({
          where: {
            assignedToUserId: u.id,
            status: { [Op.in]: [TicketStatus.RESOLVED, TicketStatus.CLOSED] },
          },
        })

        const initials = u.email ? u.email.substring(0, 2).toUpperCase() : 'EMP'

        return {
          id: u.id,
          name: u.email.split('@')[0],
          email: u.email,
          initials,
          totalAssigned,
          openCount,
          closedCount,
        }
      }),
    )

    res.status(200).json({
      success: true,
      data: employeesWithMetrics,
    })
  } catch (error) {
    console.error('Error fetching assignable employees:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch assignable employees' })
  }
}

/**
 * Fetch paginated list of tickets
 */
export async function getTickets(req: Request, res: Response): Promise<void> {
  try {
    const locId = (req.query.locId || req.query.locationId || req.params.locationId) as string | undefined
    const {
      category,
      priority,
      status,
      tab,
      search,
      assignedToUserId,
      unitId,
      residentId,
      page = '1',
      limit = '50',
    } = req.query

    const where: Record<string, unknown> = {}

    if (locId) {
      where.locId = locId
    }

    if (category && category !== 'ALL') {
      where.category = category
    }

    if (priority && priority !== 'ALL') {
      where.priority = priority
    }

    // Tab filter: Open, In Progress, Closed
    if (tab && tab !== 'ALL') {
      if (tab === 'OPEN') {
        where.status = TicketStatus.OPEN
        if (!assignedToUserId) {
          where.assignedToUserId = null
        }
      } else if (tab === 'IN_PROGRESS') {
        where.status = {
          [Op.notIn]: [TicketStatus.RESOLVED, TicketStatus.CLOSED, TicketStatus.CANCELLED],
        }
        if (!assignedToUserId) {
          where[Op.or as unknown as string] = [
            { status: { [Op.in]: [TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD] } },
            { assignedToUserId: { [Op.ne]: null } },
          ]
        }
      } else if (tab === 'CLOSED') {
        where.status = { [Op.in]: [TicketStatus.RESOLVED, TicketStatus.CLOSED, TicketStatus.CANCELLED] }
      }
    } else if (status && status !== 'ALL') {
      where.status = status
    }

    if (assignedToUserId) {
      where.assignedToUserId = assignedToUserId
    }

    if (unitId) {
      where.unitId = unitId
    }

    if (residentId) {
      where.residentId = residentId
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      const query = `%${search.trim()}%`
      where[Op.or as unknown as string] = [
        { ticketNumber: { [Op.iLike || Op.like]: query } },
        { title: { [Op.iLike || Op.like]: query } },
        { description: { [Op.iLike || Op.like]: query } },
      ]
    }

    const pageNum = parseInt(page as string, 10) || 1
    const limitNum = parseInt(limit as string, 10) || 50
    const offset = (pageNum - 1) * limitNum

    const { count, rows: tickets } = await Ticket.findAndCountAll({
      where,
      include: [
        { model: Property, as: 'property', required: false },
        { model: PropertyUnit, as: 'unit', required: false },
        { model: Resident, as: 'resident', required: false },
        { model: Department, as: 'department', required: false },
        { model: JobCategory, as: 'jobCategory', required: false },
        { model: TicketCategory, as: 'categoryObj', required: false },
        { model: TicketSubCategory, as: 'subCategoryObj', required: false },
        { model: User, as: 'assignedToUser', attributes: ['id', 'email'], required: false },
        { model: User, as: 'raisedByUser', attributes: ['id', 'email'], required: false },
        { model: AssetVendor, as: 'vendor', required: false },
        { model: Asset, as: 'asset', required: false },
      ],
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset,
      distinct: true,
    })

    res.status(200).json({
      success: true,
      data: tickets,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
      },
    })
  } catch (error) {
    console.error('Error fetching tickets:', error)
    const errMessage = error instanceof Error ? error.message : 'Failed to fetch tickets'
    res.status(500).json({ success: false, message: errMessage })
  }
}

/**
 * Get ticket metrics
 */
export async function getTicketStats(req: Request, res: Response): Promise<void> {
  try {
    const locId = (req.query.locId || req.query.locationId || req.params.locationId) as string | undefined
    const where: Record<string, unknown> = {}
    if (locId) {
      where.locId = locId
    }

    const total = await Ticket.count({ where })
    const open = await Ticket.count({ where: { ...where, status: TicketStatus.OPEN } })
    const inProgress = await Ticket.count({
      where: { ...where, status: { [Op.in]: [TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD] } },
    })
    const closed = await Ticket.count({
      where: { ...where, status: { [Op.in]: [TicketStatus.RESOLVED, TicketStatus.CLOSED, TicketStatus.CANCELLED] } },
    })
    const overdue = await Ticket.count({
      where: {
        ...where,
        status: { [Op.notIn]: [TicketStatus.CLOSED, TicketStatus.CANCELLED, TicketStatus.RESOLVED] },
        dueDate: { [Op.lt]: new Date() },
      },
    })

    res.status(200).json({
      success: true,
      data: {
        total,
        open,
        inProgress,
        closed,
        overdue,
      },
    })
  } catch (error) {
    console.error('Error fetching ticket stats:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch ticket stats' })
  }
}

/**
 * Get single ticket details with full activity timeline
 */
export async function getTicketById(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string

    const ticket = await Ticket.findByPk(id, {
      include: [
        { model: Property, as: 'property' },
        { model: PropertyUnit, as: 'unit' },
        { model: Resident, as: 'resident' },
        { model: Department, as: 'department' },
        { model: JobCategory, as: 'jobCategory' },
        { model: TicketCategory, as: 'categoryObj' },
        { model: TicketSubCategory, as: 'subCategoryObj' },
        { model: User, as: 'assignedToUser', attributes: ['id', 'email'] },
        { model: User, as: 'raisedByUser', attributes: ['id', 'email'] },
        { model: AssetVendor, as: 'vendor' },
        { model: Asset, as: 'asset' },
        {
          model: TicketActivityLog,
          as: 'activityLogs',
          include: [{ model: User, as: 'performedByUser', attributes: ['id', 'email'] }],
        },
      ],
      order: [[{ model: TicketActivityLog, as: 'activityLogs' }, 'createdAt', 'DESC']],
    })

    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' })
      return
    }

    res.status(200).json({
      success: true,
      data: ticket,
    })
  } catch (error) {
    console.error('Error fetching ticket details:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch ticket details' })
  }
}

/**
 * Create ticket (Web App / Mobile App)
 */
export async function createTicket(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const propertyLocationId = req.body.locId || req.params.locationId || req.query.locId
    const {
      title,
      description,
      category = 'REPAIR_MAINTENANCE',
      priority = TicketPriority.MEDIUM,
      unitId,
      residentId,
      familyMemberId,
      departmentId,
      jobCategoryId,
      categoryId,
      subCategoryId,
      tatOption = '1-2 hour',
      assignedToUserId,
      vendorId,
      assetId,
      dueDate,
      attachments,
    } = req.body

    const userId = req.user?.id || null
    const userName = req.user?.email || 'User'

    let finalAttachments: string[] = []
    if (Array.isArray(attachments)) {
      finalAttachments = attachments
    }

    if (req.file) {
      const s3Res = await uploadFileToS3(req.file, 'tickets')
      finalAttachments.push(s3Res.location)
    }

    const monthDay = `${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}`
    const randomSuffix = Math.floor(1000 + Math.random() * 9000)
    const ticketNumber = `${monthDay}-${randomSuffix}-RME${Math.floor(1000 + Math.random() * 9000)}-1`

    let finalCategory = category
    if (typeof category === 'string') {
      const cUpper = category.toUpperCase()
      if (cUpper.includes('R&M') || cUpper.includes('REPAIR')) {
        finalCategory = 'REPAIR_MAINTENANCE'
      } else if (cUpper.includes('CLEANING') || cUpper.includes('HK') || cUpper.includes('HOUSEKEEPING')) {
        finalCategory = 'HOUSEKEEPING'
      } else if (cUpper.includes('CONCIERGE')) {
        finalCategory = 'CONCIERGE'
      }
    }

    let finalPriority = priority || TicketPriority.MEDIUM
    if (typeof priority === 'string') {
      const pUpper = priority.toUpperCase()
      if (pUpper === 'CRITICAL') finalPriority = TicketPriority.CRITICAL
      else if (pUpper === 'HIGH') finalPriority = TicketPriority.HIGH
      else if (pUpper === 'MEDIUM') finalPriority = TicketPriority.MEDIUM
      else if (pUpper === 'LOW') finalPriority = TicketPriority.LOW
      else if (pUpper === 'URGENT') finalPriority = TicketPriority.URGENT
    }

    const ticket = await Ticket.create({
      ticketNumber,
      title,
      description: description || null,
      category: finalCategory,
      priority: finalPriority,
      status: TicketStatus.OPEN,
      locId: propertyLocationId,
      unitId: unitId || null,
      residentId: residentId || null,
      familyMemberId: familyMemberId || null,
      raisedByUserId: userId,
      departmentId: departmentId || null,
      jobCategoryId: jobCategoryId || null,
      categoryId: categoryId || null,
      subCategoryId: subCategoryId || null,
      tatOption: tatOption || '1-2 hour',
      assignedToUserId: assignedToUserId || null,
      vendorId: vendorId || null,
      assetId: assetId || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      attachments: finalAttachments.length > 0 ? finalAttachments : null,
      createdBy: userId,
    })

    await TicketActivityLog.create({
      ticketId: ticket.id,
      performedByUserId: userId,
      performedByName: userName,
      activityType: TicketActivityType.CREATED,
      toStatus: TicketStatus.OPEN,
      comment: `Ticket created with number ${ticketNumber}`,
      attachments: finalAttachments.length > 0 ? finalAttachments : null,
      createdBy: userId,
    })

    res.status(201).json({
      success: true,
      message: 'Ticket created successfully',
      data: ticket,
    })
  } catch (error) {
    console.error('Error creating ticket:', error)
    res.status(500).json({ success: false, message: 'Failed to create ticket' })
  }
}

/**
 * Update Category, Sub Category, TAT SLA, and Priority options
 */
export async function updateTicketOptions(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const ticket = await Ticket.findByPk(id)

    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' })
      return
    }

    const { categoryId, subCategoryId, tatOption, priority, status } = req.body
    const userId = req.user?.id || null
    const userName = req.user?.email || 'User'

    const updatePayload: Partial<Ticket> = {}

    if (categoryId !== undefined) updatePayload.categoryId = categoryId
    if (subCategoryId !== undefined) updatePayload.subCategoryId = subCategoryId
    if (tatOption !== undefined) updatePayload.tatOption = tatOption
    if (priority !== undefined) updatePayload.priority = priority
    if (status !== undefined) updatePayload.status = status

    await ticket.update(updatePayload)

    await TicketActivityLog.create({
      ticketId: ticket.id,
      performedByUserId: userId,
      performedByName: userName,
      activityType: TicketActivityType.UPDATED,
      comment: `Updated options (TAT: ${tatOption || ticket.tatOption}, Priority: ${priority || ticket.priority})`,
      createdBy: userId,
    })

    res.status(200).json({
      success: true,
      message: 'Ticket options updated successfully',
      data: ticket,
    })
  } catch (error) {
    console.error('Error updating ticket options:', error)
    res.status(500).json({ success: false, message: 'Failed to update ticket options' })
  }
}

/**
 * Assign employee to ticket with approval logging
 */
export async function assignTicket(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const { assignedToUserId, departmentId, jobCategoryId, vendorId } = req.body

    const ticket = await Ticket.findByPk(id)
    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' })
      return
    }

    const userId = req.user?.id || null
    const userName = req.user?.email || 'User'

    const assignTarget = assignedToUserId || userId

    await ticket.update({
      assignedToUserId: assignTarget,
      approvedByUserId: userId,
      approvedAt: new Date(),
      departmentId: departmentId !== undefined ? departmentId : ticket.departmentId,
      jobCategoryId: jobCategoryId !== undefined ? jobCategoryId : ticket.jobCategoryId,
      vendorId: vendorId !== undefined ? vendorId : ticket.vendorId,
      status: ticket.status === TicketStatus.OPEN ? TicketStatus.IN_PROGRESS : ticket.status,
      updatedBy: userId,
    })

    await TicketActivityLog.create({
      ticketId: ticket.id,
      performedByUserId: userId,
      performedByName: userName,
      activityType: TicketActivityType.ASSIGNED,
      fromStatus: ticket.status,
      toStatus: TicketStatus.IN_PROGRESS,
      comment: `Ticket assigned to employee`,
      createdBy: userId,
    })

    res.status(200).json({
      success: true,
      message: 'Ticket assigned successfully',
      data: ticket,
    })
  } catch (error) {
    console.error('Error assigning ticket:', error)
    res.status(500).json({ success: false, message: 'Failed to assign ticket' })
  }
}

/**
 * Add comment to activity log
 */
export async function addTicketComment(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const { comment, attachments } = req.body

    const ticket = await Ticket.findByPk(id)
    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' })
      return
    }

    const userId = req.user?.id || null
    const userName = req.user?.email || 'User'

    let finalAttachments: string[] = []
    if (Array.isArray(attachments)) {
      finalAttachments = attachments
    }

    if (req.file) {
      const s3Res = await uploadFileToS3(req.file, 'tickets/comments')
      finalAttachments.push(s3Res.location)
    }

    const activityLog = await TicketActivityLog.create({
      ticketId: ticket.id,
      performedByUserId: userId,
      performedByName: userName,
      activityType: TicketActivityType.COMMENT_ADDED,
      comment,
      attachments: finalAttachments.length > 0 ? finalAttachments : null,
      createdBy: userId,
    })

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      data: activityLog,
    })
  } catch (error) {
    console.error('Error adding ticket comment:', error)
    res.status(500).json({ success: false, message: 'Failed to add comment' })
  }
}

export async function deleteTicket(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const ticket = await Ticket.findByPk(id)
    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' })
      return
    }

    await ticket.destroy()
    res.status(200).json({
      success: true,
      message: 'Ticket deleted successfully',
    })
  } catch (error) {
    console.error('Error deleting ticket:', error)
    res.status(500).json({ success: false, message: 'Failed to delete ticket' })
  }
}
