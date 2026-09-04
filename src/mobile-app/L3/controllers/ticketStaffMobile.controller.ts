import type { Response } from 'express'
import { Op } from 'sequelize'
import {
  Department,
  JobCategory,
  Property,
  PropertyUnit,
  Resident,
  Ticket,
  TicketActivityLog,
  User,
  UserDetail,
  UserLocation,
} from '../../../models/index.js'
import { TicketActivityType, TicketStatus } from '../../../enums/ticket.enum.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { uploadFileToS3 } from '../../../middlewares/s3/index.js'

function formatTimeAgo(date: Date | string | null | undefined): string {
  if (!date) return 'Just now'
  const now = new Date().getTime()
  const created = new Date(date).getTime()
  const diffMinutes = Math.max(1, Math.floor((now - created) / (1000 * 60)))

  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

/**
 * GET /api/v1/mobile/l3/tickets
 * Fetch service tickets assigned to the logged-in staff member or in their department (e.g. Repair & Maintenance).
 */
export async function getStaffTickets(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const staffUserId = req.user?.id
    if (!staffUserId) {
      res.status(401).json({ success: false, message: 'Authentication required' })
      return
    }

    // Lookup staff user profile and department/jobCategory
    const staffUser = (await User.findByPk(staffUserId, {
      include: [
        { model: UserDetail, as: 'profile' },
        {
          model: UserLocation,
          as: 'userLocations',
          where: { isDeleted: false },
          required: false,
          include: [
            { model: Department, as: 'department' },
            { model: JobCategory, as: 'jobCategory' },
          ],
        },
      ],
    })) as (User & { profile?: UserDetail; userLocations?: Array<UserLocation & { department?: Department }> }) | null

    const primaryLoc = staffUser?.userLocations?.[0]
    const staffDeptId = primaryLoc?.departmentId || null
    const staffLocId = primaryLoc?.locId || null

    const { status, search, assignedOnly } = req.query as {
      status?: string
      search?: string
      assignedOnly?: string
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereCondition: any = {}

    // Assigned only vs department tickets
    if (assignedOnly === 'true' || !staffDeptId) {
      whereCondition.assignedToUserId = staffUserId
    } else {
      whereCondition[Op.or] = [{ assignedToUserId: staffUserId }, { departmentId: staffDeptId }]
    }

    if (staffLocId) {
      whereCondition[Op.and] = [
        ...(whereCondition[Op.and] || []),
        {
          [Op.or]: [{ assignedToUserId: staffUserId }, { locId: staffLocId }],
        },
      ]
    }

    // Status filter
    if (status && status.toUpperCase() !== 'ALL') {
      const s = status.toUpperCase()
      if (s === 'OPEN' || s === 'ASSIGNED') {
        whereCondition.status = [TicketStatus.OPEN]
      } else if (s === 'IN_PROGRESS') {
        whereCondition.status = TicketStatus.IN_PROGRESS
      } else if (s === 'RESOLVED') {
        whereCondition.status = [TicketStatus.RESOLVED, TicketStatus.CLOSED]
      } else if (s === 'CLOSED') {
        whereCondition.status = TicketStatus.CLOSED
      } else {
        whereCondition.status = s
      }
    }

    // Optional text search
    if (search && search.trim()) {
      const q = `%${search.trim()}%`
      whereCondition[Op.and] = [
        ...(whereCondition[Op.and] || []),
        {
          [Op.or]: [
            { ticketNumber: { [Op.iLike]: q } },
            { title: { [Op.iLike]: q } },
            { description: { [Op.iLike]: q } },
          ],
        },
      ]
    }

    const tickets = await Ticket.findAll({
      where: whereCondition,
      include: [
        { model: PropertyUnit, as: 'unit', required: false },
        { model: Property, as: 'property', required: false },
        { model: Resident, as: 'resident', required: false },
        { model: Department, as: 'department', required: false },
        { model: JobCategory, as: 'jobCategory', required: false },
        {
          model: User,
          as: 'assignedToUser',
          include: [{ model: UserDetail, as: 'profile' }],
          required: false,
        },
      ],
      order: [['createdAt', 'DESC']],
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedTickets = tickets.map((t: any) => {
      const uNum = t.unit?.unit_number || t.unit?.unitNumber || t.unit?.name || null
      const blockNum = t.unit?.block_number || t.unit?.blockNumber || t.unit?.block || null
      const formattedUnit = uNum ? (blockNum ? `Tower ${blockNum} - Flat ${uNum}` : `Flat ${uNum}`) : 'Common Area'

      const rName = t.resident
        ? `${t.resident.firstName || ''} ${t.resident.lastName || ''}`.trim() || t.resident.email || 'Resident'
        : 'Facility Resident'

      const assigneeProfile = t.assignedToUser?.profile
      const assigneeName = assigneeProfile
        ? `${assigneeProfile.firstName || ''} ${assigneeProfile.lastName || ''}`.trim() ||
          t.assignedToUser?.username ||
          'Staff'
        : t.assignedToUser?.username || 'Unassigned'

      const rawAttachments = t.attachments || {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const completion = (rawAttachments as any)?.completion || null

      return {
        id: t.id,
        ticketNumber: t.ticketNumber,
        title: t.title,
        description: t.description || '',
        category: t.category,
        jobCategory: t.jobCategory?.name || null,
        departmentName: t.department?.name || 'Repair & Maintenance',
        priority: t.priority,
        status: t.status,
        unit: formattedUnit,
        unitNumber: uNum,
        blockNumber: blockNum,
        residentName: rName,
        residentPhone: t.resident?.phone || null,
        assignedToUserId: t.assignedToUserId,
        assignedToName: assigneeName,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        timeAgo: formatTimeAgo(t.createdAt),
        resolvedAt: t.resolvedAt || null,
        resolutionNotes: t.resolutionNotes || null,
        attachments: t.attachments || null,
        completion,
      }
    })

    res.status(200).json({
      success: true,
      message: 'Staff tickets retrieved successfully',
      data: formattedTickets,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Error fetching L3 staff tickets:', err)
    res.status(500).json({ success: false, message })
  }
}

/**
 * GET /api/v1/mobile/l3/tickets/:id
 * Retrieve single ticket details with activity logs.
 */
export async function getStaffTicketById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    if (!id) {
      res.status(400).json({ success: false, message: 'Ticket ID is required' })
      return
    }

    const ticket = await Ticket.findByPk(id, {
      include: [
        { model: PropertyUnit, as: 'unit', required: false },
        { model: Property, as: 'property', required: false },
        { model: Resident, as: 'resident', required: false },
        { model: Department, as: 'department', required: false },
        { model: JobCategory, as: 'jobCategory', required: false },
        {
          model: User,
          as: 'assignedToUser',
          include: [{ model: UserDetail, as: 'profile' }],
          required: false,
        },
      ],
    })

    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' })
      return
    }

    const activityLogs = await TicketActivityLog.findAll({
      where: { ticketId: id },
      order: [['createdAt', 'DESC']],
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = ticket as any
    const uNum = t.unit?.unit_number || t.unit?.unitNumber || null
    const blockNum = t.unit?.block_number || t.unit?.blockNumber || null
    const formattedUnit = uNum ? (blockNum ? `Tower ${blockNum} - Flat ${uNum}` : `Flat ${uNum}`) : 'Common Area'

    const rName = t.resident
      ? `${t.resident.firstName || ''} ${t.resident.lastName || ''}`.trim() || t.resident.email || 'Resident'
      : 'Facility Resident'

    const rawAttachments = t.attachments || {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const completion = (rawAttachments as any)?.completion || null

    res.status(200).json({
      success: true,
      data: {
        id: t.id,
        ticketNumber: t.ticketNumber,
        title: t.title,
        description: t.description || '',
        category: t.category,
        jobCategory: t.jobCategory?.name || null,
        departmentName: t.department?.name || 'Repair & Maintenance',
        priority: t.priority,
        status: t.status,
        unit: formattedUnit,
        unitNumber: uNum,
        blockNumber: blockNum,
        residentName: rName,
        residentPhone: t.resident?.phone || null,
        assignedToUserId: t.assignedToUserId,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        timeAgo: formatTimeAgo(t.createdAt),
        resolvedAt: t.resolvedAt || null,
        resolutionNotes: t.resolutionNotes || null,
        attachments: t.attachments || null,
        completion,
        activityLogs,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Error fetching ticket details:', err)
    res.status(500).json({ success: false, message })
  }
}

/**
 * POST /api/v1/mobile/l3/tickets/:id/start-work
 * Transition ticket status to IN_PROGRESS when staff begins execution.
 */
export async function startWork(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const staffUserId = req.user?.id
    if (!staffUserId) {
      res.status(401).json({ success: false, message: 'Authentication required' })
      return
    }

    const id = req.params.id as string
    if (!id) {
      res.status(400).json({ success: false, message: 'Ticket ID is required' })
      return
    }

    const ticket = await Ticket.findByPk(id)

    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' })
      return
    }

    if (ticket.status === TicketStatus.RESOLVED || ticket.status === TicketStatus.CLOSED) {
      res.status(400).json({ success: false, message: 'Ticket is already resolved or closed' })
      return
    }

    const previousStatus = ticket.status

    // Update ticket status to IN_PROGRESS and assign to staff if unassigned
    ticket.status = TicketStatus.IN_PROGRESS
    if (!ticket.assignedToUserId) {
      ticket.assignedToUserId = staffUserId
    }
    ticket.updatedBy = staffUserId
    await ticket.save()

    // Get staff name for audit log
    const staffUser = (await User.findByPk(staffUserId, {
      include: [{ model: UserDetail, as: 'profile' }],
    })) as (User & { profile?: UserDetail }) | null

    const staffName = staffUser?.profile
      ? `${staffUser.profile.firstName || ''} ${staffUser.profile.lastName || ''}`.trim() || staffUser.username
      : staffUser?.username || 'Staff'

    // Create activity log
    await TicketActivityLog.create({
      ticketId: ticket.id,
      performedByUserId: staffUserId,
      performedByName: staffName,
      activityType: TicketActivityType.STATUS_CHANGE,
      fromStatus: previousStatus,
      toStatus: TicketStatus.IN_PROGRESS,
      comment: 'Staff started work order',
    })

    res.status(200).json({
      success: true,
      message: 'Work started successfully',
      data: {
        id: ticket.id,
        status: ticket.status,
        assignedToUserId: ticket.assignedToUserId,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Error starting work on ticket:', err)
    res.status(500).json({ success: false, message })
  }
}

/**
 * POST /api/v1/mobile/l3/tickets/:id/complete
 * Complete ticket with S3 uploads: invoice document, photos, audio voice note, invoice number, amount, and notes.
 */
export async function completeTicket(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const staffUserId = req.user?.id
    if (!staffUserId) {
      res.status(401).json({ success: false, message: 'Authentication required' })
      return
    }

    const id = req.params.id as string
    if (!id) {
      res.status(400).json({ success: false, message: 'Ticket ID is required' })
      return
    }

    const ticket = await Ticket.findByPk(id)

    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' })
      return
    }

    const { invoiceNumber, amount, notes, resolutionNotes } = req.body as {
      invoiceNumber?: string
      amount?: string
      notes?: string
      resolutionNotes?: string
    }

    const finalNotes = notes || resolutionNotes || ticket.resolutionNotes || ''

    // Multer files
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined
    const invoiceFile = files?.invoice?.[0]
    const photoFiles = files?.photo || []
    const audioFile = files?.audio?.[0] || files?.voiceNote?.[0]

    let invoiceUrl: string | null = null
    const photoUrls: string[] = []
    let audioUrl: string | null = null

    // 1. Upload Invoice to S3
    if (invoiceFile) {
      const uploadRes = await uploadFileToS3(invoiceFile, `tickets/${ticket.id}/invoices`)
      invoiceUrl = uploadRes.location
    }

    // 2. Upload Photos to S3
    for (const p of photoFiles) {
      const uploadRes = await uploadFileToS3(p, `tickets/${ticket.id}/photos`)
      photoUrls.push(uploadRes.location)
    }

    // 3. Upload Voice Note Audio to S3
    if (audioFile) {
      const uploadRes = await uploadFileToS3(audioFile, `tickets/${ticket.id}/audio`)
      audioUrl = uploadRes.location
    }

    const staffUser = (await User.findByPk(staffUserId, {
      include: [{ model: UserDetail, as: 'profile' }],
    })) as (User & { profile?: UserDetail }) | null

    const staffName = staffUser?.profile
      ? `${staffUser.profile.firstName || ''} ${staffUser.profile.lastName || ''}`.trim() || staffUser.username
      : staffUser?.username || 'Staff'

    const completionData = {
      invoiceNumber: invoiceNumber ? invoiceNumber.trim() : null,
      amount: amount ? Number(amount) : null,
      invoiceUrl,
      photos: photoUrls,
      audioUrl,
      completedAt: new Date().toISOString(),
      completedByUserId: staffUserId,
      completedByName: staffName,
      resolutionNotes: finalNotes,
    }

    // Update attachments JSON
    const currentAttachments = ticket.attachments || {}
    const updatedAttachments = Array.isArray(currentAttachments)
      ? { files: currentAttachments, completion: completionData }
      : { ...currentAttachments, completion: completionData }

    const previousStatus = ticket.status
    ticket.status = TicketStatus.RESOLVED
    ticket.resolvedAt = new Date()
    ticket.resolutionNotes = finalNotes
    ticket.attachments = updatedAttachments
    ticket.updatedBy = staffUserId
    await ticket.save()

    // Activity Log
    await TicketActivityLog.create({
      ticketId: ticket.id,
      performedByUserId: staffUserId,
      performedByName: staffName,
      activityType: TicketActivityType.STATUS_CHANGE,
      fromStatus: previousStatus,
      toStatus: TicketStatus.RESOLVED,
      comment: `Work order completed by staff. Invoice: ${invoiceNumber || 'N/A'}, Amount: ${amount ? `₹${amount}` : 'N/A'}`,
      attachments: completionData,
    })

    res.status(200).json({
      success: true,
      message: 'Ticket completed successfully with invoice and attachments',
      data: {
        id: ticket.id,
        status: ticket.status,
        resolvedAt: ticket.resolvedAt,
        resolutionNotes: ticket.resolutionNotes,
        completion: completionData,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Error completing ticket:', err)
    res.status(500).json({ success: false, message })
  }
}
