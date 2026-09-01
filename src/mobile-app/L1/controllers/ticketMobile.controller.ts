import type { Response } from 'express'
import { Op } from 'sequelize'
import { Department, JobCategory, PropertyUnit, Resident, Ticket, User } from '../../../models/index.js'
import { TicketPriority, TicketStatus } from '../../../enums/ticket.enum.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'

/**
 * GET /api/v1/mobile/l1/tickets/departments
 * Fetch active departments (Repair & Maintenance, Concierge) and job categories for resident mobile ticket creation.
 */
export async function getResidentTicketDepartments(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const departments = await Department.findAll({
      where: {
        code: ['RNM', 'CON'],
        isActive: true,
      },
      include: [{ model: JobCategory, as: 'jobCategories', where: { isActive: true }, required: false }],
      order: [['name', 'ASC']],
    })

    const RNM_CATS = ['Electrical', 'Carpentry', 'Plumbing', 'Miscellaneous']
    const CON_CATS = ['Housekeeping', 'Laundry', 'Customer Support', 'Transportation', 'Others']

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rnmDept = departments.find((d: any) => d.code === 'RNM') as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conDept = departments.find((d: any) => d.code === 'CON') as any

    const formattedData = [
      {
        id: rnmDept?.id || 'dept-rnm',
        code: 'RNM',
        name: 'Repair & Maintenance',
        jobCategories: RNM_CATS.map((catName) => {
          const matched = (rnmDept?.jobCategories || []).find(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (j: any) => String(j.name || '').toLowerCase() === catName.toLowerCase(),
          )
          return {
            id: matched?.id || `jc-${catName.toLowerCase()}`,
            code: matched?.code || `RNM_${catName.substring(0, 4).toUpperCase()}`,
            name: catName,
          }
        }),
      },
      {
        id: conDept?.id || 'dept-con',
        code: 'CON',
        name: 'Concierge',
        jobCategories: CON_CATS.map((catName) => {
          const matched = (conDept?.jobCategories || []).find(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (j: any) => String(j.name || '').toLowerCase() === catName.toLowerCase(),
          )
          return {
            id: matched?.id || `jc-${catName.toLowerCase()}`,
            code: matched?.code || `CON_${catName.substring(0, 4).toUpperCase()}`,
            name: catName,
          }
        }),
      },
    ]

    res.status(200).json({
      success: true,
      data: formattedData,
    })
  } catch (err) {
    console.error('Error fetching L1 resident ticket departments:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch departments' })
  }
}

/**
 * GET /api/v1/mobile/l1/tickets
 * Fetch service tickets created for the logged-in resident's flat/unit or property common areas.
 */
export async function getResidentTickets(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = req.user?.id
    if (!residentId) {
      res.status(401).json({ success: false, message: 'Authentication required' })
      return
    }

    const resident = await Resident.findByPk(residentId, {
      include: [{ model: PropertyUnit, as: 'unit', required: false }],
    })

    if (!resident) {
      res.status(404).json({ success: false, message: 'Resident account not found' })
      return
    }

    // Determine target unitId from request query or resident profile
    const targetUnitId = (req.query.unitId as string) || resident.unitId
    const targetLocId = (req.query.locationId as string) || resident.locId || req.locationId

    // Flat-based ticket query condition
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereCondition: any = {}

    if (targetUnitId) {
      whereCondition[Op.or] = [{ unitId: targetUnitId }, { residentId: resident.id }]
    } else if (resident.id) {
      whereCondition.residentId = resident.id
    }

    if (targetLocId) {
      whereCondition.locId = targetLocId
    }

    const tickets = await Ticket.findAll({
      where: whereCondition,
      include: [
        { model: PropertyUnit, as: 'unit', required: false },
        { model: User, as: 'assignedToUser', attributes: ['id', 'email'], required: false },
      ],
      order: [['createdAt', 'DESC']],
    })

    const residentName = resident.firstName
      ? `${resident.firstName} ${resident.lastName || ''}`.trim()
      : resident.email?.split('@')[0] || 'Resident'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedTickets = tickets.map((t: any) => {
      const uNum = t.unit?.unit_number || t.unit?.unitNumber || resident.unit?.unit_number
      const assigneeName = t.assignedToUser?.email?.split('@')[0] || (t.assignedToUserId ? 'Technician' : 'Unassigned')
      const isClosed = t.status === TicketStatus.CLOSED || t.status === TicketStatus.RESOLVED

      // Audit tracking logic
      const isAssignedToSelf =
        t.assignedToUserId === resident.id || assigneeName.toLowerCase() === residentName.toLowerCase()
      const completedBy = isClosed ? (isAssignedToSelf ? 'Self' : assigneeName) : null
      const resolutionNotesStr = String(t.resolutionNotes || '')
      const isEscalated = Boolean(resolutionNotesStr && resolutionNotesStr.includes('[ESCALATED'))

      return {
        id: t.id,
        ticketNumber: t.ticketNumber,
        title: t.title,
        description: t.description,
        category: t.category,
        subCategory: t.subCategoryId || 'General Service',
        priority: t.priority,
        status: t.status,
        createdAt: t.createdAt,
        unitId: t.unitId || resident.unitId || null,
        unitNumber: t.unitId ? (uNum ? (uNum.includes('-') ? uNum : `A, A-${uNum}`) : 'A, A-101') : 'Common Area',
        areaType: t.unitId ? 'IN_FLAT' : 'COMMON_AREA',
        assignedTo: assigneeName,
        raisedBy: residentName,
        completedBy: completedBy || (isClosed ? 'Self' : null),
        tatUpdatedBy: t.tatOption ? residentName : null,
        escalatedBy: isEscalated ? residentName : null,
        tatOption: t.tatOption || '1-2 hour',
        customTatDeadline: t.customTatDeadline || null,
        resolutionNotes: t.resolutionNotes || null,
        attachments: t.attachments || [],
      }
    })

    res.status(200).json({
      success: true,
      message: 'Resident tickets retrieved successfully',
      data: formattedTickets,
    })
  } catch (err) {
    console.error('Error fetching resident tickets:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch resident tickets' })
  }
}

/**
 * POST /api/v1/mobile/l1/tickets
 * Create a new service ticket (In-Flat or Common Area) associated with resident.
 */
export async function createResidentTicket(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = req.user?.id
    if (!residentId) {
      res.status(401).json({ success: false, message: 'Authentication required' })
      return
    }

    const resident = await Resident.findByPk(residentId, {
      include: [{ model: PropertyUnit, as: 'unit', required: false }],
    })

    if (!resident) {
      res.status(404).json({ success: false, message: 'Resident account not found' })
      return
    }

    const {
      areaType,
      department,
      category,
      subCategory,
      departmentId,
      jobCategoryId,
      title,
      description,
      priority,
      unitId,
    } = req.body

    // Auto-generate title from department & category if title not passed
    const generatedTitle =
      title && String(title).trim()
        ? String(title).trim()
        : `${department || 'Service Request'} - ${category || 'General'}`

    // Determine target unitId based on areaType selection
    const isCommonArea = areaType === 'COMMON_AREA'
    const targetUnitId = isCommonArea ? null : unitId || resident.unitId || null

    const formattedCategory = isCommonArea
      ? `Common Area${department ? ` - ${department}` : ''}`
      : category || 'In-Flat Service'

    const residentName = resident.firstName
      ? `${resident.firstName} ${resident.lastName || ''}`.trim()
      : resident.email?.split('@')[0] || 'Resident'
    const now = new Date()
    const monthDay = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const randomNum = Math.floor(1000 + Math.random() * 9000)
    const ticketNumber = `${monthDay}-${randomNum}-RME${Math.floor(1000 + Math.random() * 9000)}-1`

    const newTicket = await Ticket.create({
      ticketNumber,
      title: generatedTitle,
      description: description ? String(description).trim() : null,
      category: formattedCategory,
      departmentId: departmentId || null,
      subCategoryId: jobCategoryId || subCategory || null,
      priority: priority || TicketPriority.MEDIUM,
      status: TicketStatus.OPEN,
      locId: resident.locId,
      unitId: targetUnitId,
      residentId: resident.id,
      tatOption: '1-2 hour',
    })

    const uNum = resident.unit?.unit_number || 'A-101'

    res.status(201).json({
      success: true,
      message: `Service ticket created successfully for ${isCommonArea ? 'Common Area' : 'In-Flat'}`,
      data: {
        id: newTicket.id,
        ticketNumber: newTicket.ticketNumber,
        title: newTicket.title,
        description: newTicket.description,
        category: newTicket.category,
        subCategory: newTicket.subCategoryId || category || 'General Service',
        priority: newTicket.priority,
        status: newTicket.status,
        createdAt: newTicket.createdAt,
        unitId: targetUnitId,
        unitNumber: isCommonArea ? 'Common Area' : uNum.includes('-') ? uNum : `A, A-${uNum}`,
        areaType: isCommonArea ? 'COMMON_AREA' : 'IN_FLAT',
        assignedTo: 'Unassigned',
        raisedBy: residentName,
        completedBy: null,
        tatUpdatedBy: residentName,
        escalatedBy: null,
        tatOption: newTicket.tatOption || '1-2 hour',
      },
    })
  } catch (err) {
    console.error('Error creating resident ticket:', err)
    res.status(500).json({ success: false, message: 'Failed to create service ticket' })
  }
}

/**
 * GET /api/v1/mobile/l1/tickets/:id
 * Retrieve details for a single ticket by ID.
 */
export async function getResidentTicketById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const idStr = String(req.params.id)
    const ticket = await Ticket.findByPk(idStr, {
      include: [
        { model: PropertyUnit, as: 'unit', required: false },
        { model: User, as: 'assignedToUser', attributes: ['id', 'email'], required: false },
      ],
    })

    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' })
      return
    }

    res.status(200).json({
      success: true,
      data: ticket,
    })
  } catch (err) {
    console.error('Error fetching ticket by id:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch ticket details' })
  }
}

/**
 * PATCH /api/v1/mobile/l1/tickets/:id/tat
 * Update Turn Around Time (TAT) deadline and option for a ticket.
 */
export async function updateTicketTat(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const idStr = String(req.params.id)
    const { tatOption, customTatDeadline } = req.body

    const ticket = await Ticket.findByPk(idStr)
    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' })
      return
    }

    if (tatOption) ticket.tatOption = tatOption
    if (customTatDeadline) ticket.customTatDeadline = new Date(customTatDeadline)

    await ticket.save()

    res.status(200).json({
      success: true,
      message: 'TAT deadline updated successfully',
      data: ticket,
    })
  } catch (err) {
    console.error('Error updating ticket TAT:', err)
    res.status(500).json({ success: false, message: 'Failed to update TAT' })
  }
}

/**
 * PATCH /api/v1/mobile/l1/tickets/:id/escalate
 * Escalate a ticket with a reason and upgrade priority to HIGH/CRITICAL.
 */
export async function escalateTicket(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const idStr = String(req.params.id)
    const { reason, priority } = req.body

    if (!reason || !String(reason).trim()) {
      res.status(400).json({ success: false, message: 'Escalation reason is required' })
      return
    }

    const ticket = await Ticket.findByPk(idStr)
    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' })
      return
    }

    // Automatically elevate priority to HIGH or CRITICAL
    const newPriority = priority || TicketPriority.HIGH
    ticket.priority = newPriority

    // Append escalation reason to resolution notes or description
    const reasonText = `[ESCALATED ${new Date().toLocaleString()}]: ${String(reason).trim()}`
    ticket.resolutionNotes = ticket.resolutionNotes ? `${ticket.resolutionNotes}\n${reasonText}` : reasonText

    await ticket.save()

    res.status(200).json({
      success: true,
      message: `Ticket escalated to ${newPriority} priority successfully`,
      data: ticket,
    })
  } catch (err) {
    console.error('Error escalating ticket:', err)
    res.status(500).json({ success: false, message: 'Failed to escalate ticket' })
  }
}
