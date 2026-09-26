import type { Response } from 'express'
import { Op } from 'sequelize'
import {
  Department,
  JobCategory,
  PropertyUnit,
  Resident,
  ResidentFamilyMember,
  Ticket,
  TicketActivityLog,
  TicketFeedback,
  User,
} from '../../../models/index.js'
import { TicketActivityType, TicketFeedbackRating } from '../../../enums/ticket.enum.js'
import { TicketPriority, TicketStatus } from '../../../enums/ticket.enum.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { uploadFileToS3, uploadBase64ToS3 } from '../../../middlewares/s3/index.js'
import { resolveHousehold } from '../../../utils/household.util.js'

/**
 * Tickets have no `assignedAt` column, so the moment a ticket was handed to a
 * staff member is read back from its activity log. Returns the earliest
 * ASSIGNED entry per ticket id, which is what the resident timeline shows.
 */
async function getAssignedAtByTicket(ticketIds: string[]): Promise<Record<string, string>> {
  if (ticketIds.length === 0) return {}

  const logs = (await TicketActivityLog.findAll({
    where: { ticketId: { [Op.in]: ticketIds }, activityType: TicketActivityType.ASSIGNED },
    order: [['createdAt', 'ASC']],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })) as any[]

  const byTicket: Record<string, string> = {}
  for (const log of logs) {
    if (!byTicket[log.ticketId]) byTicket[log.ticketId] = log.createdAt
  }
  return byTicket
}

/** Marks the activity-log entries written when a resident changes the TAT. */
const TAT_LOG_PREFIX = 'TAT updated:'

/**
 * Latest TAT change per ticket id, read from the activity log, so the resident
 * timeline can show when the turnaround time was last revised and by whom.
 */
async function getTatUpdatesByTicket(ticketIds: string[]): Promise<Record<string, { at: string; by: string | null }>> {
  if (ticketIds.length === 0) return {}

  const logs = (await TicketActivityLog.findAll({
    where: {
      ticketId: { [Op.in]: ticketIds },
      activityType: TicketActivityType.UPDATED,
      comment: { [Op.like]: `${TAT_LOG_PREFIX}%` },
    },
    order: [['createdAt', 'DESC']],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })) as any[]

  const byTicket: Record<string, { at: string; by: string | null }> = {}
  for (const log of logs) {
    if (!byTicket[log.ticketId]) {
      byTicket[log.ticketId] = { at: log.createdAt, by: log.performedByName || null }
    }
  }
  return byTicket
}

/**
 * Sanitizes stored attachments for API responses:
 * - Strips any base64 data blobs (only S3/HTTPS URLs are kept)
 * - Removes legacy duplicate fields: `voiceNote` (mirrors audioUrl) and `files` (mirrors photos)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeAttachments(atts: any): any {
  if (!atts) return null
  if (typeof atts !== 'object') return null

  const isBase64 = (v: unknown) => typeof v === 'string' && (v.startsWith('data:') || v.startsWith('base64,'))

  // Older tickets store attachments as a bare array of URLs. Object.entries()
  // would turn that into {"0": url}, so keep the array shape intact.
  if (Array.isArray(atts)) {
    return atts.filter((v) => !isBase64(v))
  }

  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(atts)) {
    // Drop legacy duplicate fields — audioUrl is canonical for audio, photos for images
    if (key === 'voiceNote' || key === 'files') continue

    if (Array.isArray(value)) {
      // Filter out any base64 strings from arrays
      sanitized[key] = (value as unknown[]).filter((v) => !isBase64(v))
    } else if (isBase64(value)) {
      // Omit base64 scalar values
      sanitized[key] = null
    } else {
      sanitized[key] = value
    }
  }

  return sanitized
}

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
    // Tickets are shared across the flat, so a family member reads the parent
    // resident's household rather than their own (non-existent) resident row.
    const household = resolveHousehold(req)
    if (!household) {
      res.status(401).json({ success: false, message: 'Authentication required' })
      return
    }
    const residentId = household.residentId

    const resident = await Resident.findByPk(residentId, {
      include: [{ model: PropertyUnit, as: 'unit', required: false }],
    })

    if (!resident) {
      res.status(404).json({ success: false, message: 'Resident account not found' })
      return
    }

    const isSpecificFlatQuery = Boolean(req.query.flatNumber || req.query.unitNumber || req.query.unitId)

    // Determine flat number from query first, or fallback to resident profile flat
    const flatNumber =
      (req.query.flatNumber as string) || (req.query.unitNumber as string) || resident.unit?.unit_number || null

    let unitIds: string[] = []

    if (flatNumber) {
      const matchedUnits = await PropertyUnit.findAll({
        where: { unit_number: flatNumber },
        attributes: ['id'],
      })
      unitIds = matchedUnits.map((u: PropertyUnit) => u.id)
    } else if (req.query.unitId) {
      unitIds = [String(req.query.unitId)]
    } else if (resident.unitId) {
      unitIds = [resident.unitId]
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereCondition: any = {}

    if (isSpecificFlatQuery) {
      // 1. Explicit flat filter requested: query strictly by specified flat
      if (unitIds.length === 0) {
        res.status(200).json({
          success: true,
          message: 'No flat found for ticket retrieval',
          data: [],
        })
        return
      }
      whereCondition.unitId = unitIds.length === 1 ? unitIds[0] : { [Op.in]: unitIds }
    } else {
      // 2. Default post-login mobile query:
      // Return all tickets for the resident's flat PLUS any common area tickets raised by the resident
      if (unitIds.length > 0) {
        whereCondition[Op.or] = [
          { unitId: unitIds.length === 1 ? unitIds[0] : { [Op.in]: unitIds } },
          { residentId: resident.id, unitId: null },
        ]
      } else {
        whereCondition.residentId = resident.id
      }
    }

    const targetLocId = (req.query.locationId as string) || null
    if (targetLocId) {
      whereCondition.locId = targetLocId
    }

    const tickets = await Ticket.findAll({
      where: whereCondition,
      include: [
        { model: PropertyUnit, as: 'unit', required: false },
        { model: User, as: 'assignedToUser', attributes: ['id', 'email'], required: false },
        { model: TicketFeedback, as: 'feedback', required: false },
      ],
      order: [['createdAt', 'DESC']],
    })

    const residentName = resident.firstName
      ? `${resident.firstName} ${resident.lastName || ''}`.trim()
      : resident.email?.split('@')[0] || 'Resident'

    const ticketIds = tickets.map((t) => t.id)
    const assignedAtByTicket = await getAssignedAtByTicket(ticketIds)
    const tatUpdatesByTicket = await getTatUpdatesByTicket(ticketIds)

    // A ticket is owned by the flat but raised by one person in it, so the
    // household's family members are resolved once for attribution.
    const householdMembers = (await ResidentFamilyMember.findAll({
      where: { residentId: resident.id, isDeleted: false },
      attributes: ['id', 'firstName', 'lastName', 'relation'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any[]
    const memberById = new Map(householdMembers.map((fm) => [fm.id, fm]))

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
      const isEscalated =
        Boolean(t.escalatedAt) || Boolean(resolutionNotesStr && resolutionNotesStr.includes('[ESCALATED'))

      const raisedByMember = t.familyMemberId ? memberById.get(t.familyMemberId) : null

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
        assignedAt: assignedAtByTicket[t.id] || null,
        tatUpdatedAt: tatUpdatesByTicket[t.id]?.at || null,
        feedback: t.feedback
          ? {
              rating: t.feedback.rating,
              comment: t.feedback.comment,
              submittedAt: t.feedback.createdAt,
            }
          : null,
        workStartedAt: t.workStartedAt || null,
        completedAt: t.completedAt || t.resolvedAt || null,
        closedAt: t.closedAt || t.verifiedAt || null,
        unitId: t.unitId || resident.unitId || null,
        unitNumber: t.unitId ? (uNum ? (uNum.includes('-') ? uNum : `A, A-${uNum}`) : 'A, A-101') : 'Common Area',
        areaType: t.unitId ? 'IN_FLAT' : 'COMMON_AREA',
        assignedTo: assigneeName,
        raisedBy: raisedByMember
          ? `${raisedByMember.firstName || ''} ${raisedByMember.lastName || ''}`.trim()
          : residentName,
        raisedByRelation: raisedByMember?.relation || null,
        raisedByFamilyMemberId: t.familyMemberId || null,
        completedBy: completedBy || (isClosed ? 'Self' : null),
        tatUpdatedBy: tatUpdatesByTicket[t.id]?.by || (t.tatOption ? residentName : null),
        escalatedBy: isEscalated ? t.escalatedByName || residentName : null,
        escalatedAt: t.escalatedAt || null,
        escalationReason: t.escalationReason || null,
        tatOption: t.tatOption || '1-2 hour',
        customTatDeadline: t.customTatDeadline || null,
        resolutionNotes: t.resolutionNotes || null,
        attachments: sanitizeAttachments(t.attachments),
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
    const household = resolveHousehold(req)
    if (!household) {
      res.status(401).json({ success: false, message: 'Authentication required' })
      return
    }
    const residentId = household.residentId

    const resident = await Resident.findByPk(residentId, {
      include: [{ model: PropertyUnit, as: 'unit', required: false }],
    })

    if (!resident) {
      res.status(404).json({ success: false, message: 'Resident account not found' })
      return
    }

    // Check for uploaded files (multipart/form-data)
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined
    const audioFile = files?.audio?.[0] || files?.voice?.[0] || files?.voiceNote?.[0]
    const photoFiles = files?.photos || files?.photo || files?.media || files?.files || []

    let audioUrl: string | null = null
    const photoUrls: string[] = []

    // 1. Upload voice note file to S3 if provided
    if (audioFile) {
      try {
        const uploadRes = await uploadFileToS3(audioFile, 'tickets/audio')
        audioUrl = uploadRes.location
      } catch (uploadErr) {
        console.warn('Could not upload audio to S3, skipping audio attachment:', uploadErr)
        // Do NOT fall back to base64 — only store S3 URLs in the database
      }
    }

    // 2. Upload photo files to S3 if provided
    for (const p of photoFiles) {
      try {
        const uploadRes = await uploadFileToS3(p, 'tickets/photos')
        photoUrls.push(uploadRes.location)
      } catch (uploadErr) {
        console.warn('Could not upload photo to S3, skipping photo attachment:', uploadErr)
        // Do NOT fall back to base64 — only store S3 URLs in the database
      }
    }

    const {
      areaType,
      department,
      category,
      subCategory,
      subCategoryId,
      departmentId,
      jobCategoryId,
      title,
      description,
      note,
      message,
      priority,
      unitId,
      audioUrl: bodyAudioUrl,
      voiceUrl: bodyVoiceUrl,
      audio: bodyAudio,
      photos: bodyPhotos,
      images: bodyImages,
      media: bodyMedia,
      attachments: bodyAttachments,
    } = req.body

    const finalDescription = (description || note || message || '').trim() || null

    // 3. Process any body/JSON audio if multipart audio wasn't provided
    if (!audioUrl) {
      const candidateAudio = bodyAudioUrl || bodyVoiceUrl || (typeof bodyAudio === 'string' ? bodyAudio : null)
      if (candidateAudio) {
        if (candidateAudio.startsWith('data:')) {
          // Upload base64 audio to S3 — do NOT store raw base64 in DB
          try {
            const s3Url = await uploadBase64ToS3(candidateAudio, 'tickets/audio')
            if (s3Url && !s3Url.startsWith('data:')) {
              audioUrl = s3Url
            }
          } catch {
            console.warn('Could not upload base64 audio to S3, skipping audio attachment')
            // Do NOT fall back to base64
          }
        } else if (candidateAudio.startsWith('http')) {
          // Already an S3/HTTP URL — use directly
          audioUrl = candidateAudio
        }
        // Ignore local file paths (they cannot be accessed server-side)
      }
    }

    // 4. Process any body/JSON photos if provided
    const rawBodyPhotos =
      bodyPhotos ||
      bodyImages ||
      bodyMedia ||
      (Array.isArray(bodyAttachments) ? bodyAttachments : bodyAttachments?.photos) ||
      []
    const parsedBodyPhotos = Array.isArray(rawBodyPhotos)
      ? rawBodyPhotos
      : typeof rawBodyPhotos === 'string'
        ? [rawBodyPhotos]
        : []

    for (const p of parsedBodyPhotos) {
      if (typeof p === 'string' && p.trim() !== '') {
        if (p.startsWith('data:')) {
          // Upload base64 photo to S3 — do NOT store raw base64 in DB
          try {
            const s3Url = await uploadBase64ToS3(p, 'tickets/photos')
            if (s3Url && !s3Url.startsWith('data:')) {
              photoUrls.push(s3Url)
            }
          } catch {
            console.warn('Could not upload base64 photo to S3, skipping photo attachment')
            // Do NOT fall back to base64
          }
        } else if (p.startsWith('http')) {
          // Already an S3/HTTP URL — use directly
          photoUrls.push(p)
        }
        // Ignore local file paths (they cannot be accessed server-side)
      }
    }

    const ticketAttachments = {
      audioUrl: audioUrl || null,
      photos: photoUrls,
      notes: finalDescription,
    }

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
      description: finalDescription,
      category: formattedCategory,
      departmentId: departmentId || null,
      jobCategoryId: jobCategoryId || null,
      subCategoryId: subCategoryId || null,
      priority: priority || TicketPriority.MEDIUM,
      status: TicketStatus.OPEN,
      locId: resident.locId,
      unitId: targetUnitId,
      residentId: resident.id,
      familyMemberId: household.familyMemberId,
      tatOption: '1-2 hour',
      attachments: ticketAttachments,
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
        subCategory: subCategory || category || 'General Service',
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
        attachments: newTicket.attachments,
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
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idStr)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ticket: any = null

    if (isUuid) {
      ticket = await Ticket.findByPk(idStr, {
        include: [
          { model: PropertyUnit, as: 'unit', required: false },
          { model: User, as: 'assignedToUser', attributes: ['id', 'email'], required: false },
          { model: TicketFeedback, as: 'feedback', required: false },
        ],
      })
    }

    if (!ticket) {
      ticket = await Ticket.findOne({
        where: { ticketNumber: idStr },
        include: [
          { model: PropertyUnit, as: 'unit', required: false },
          { model: User, as: 'assignedToUser', attributes: ['id', 'email'], required: false },
          { model: TicketFeedback, as: 'feedback', required: false },
        ],
      })
    }

    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' })
      return
    }

    const assignedAtByTicket = await getAssignedAtByTicket([ticket.id])
    const tatUpdatesByTicket = await getTatUpdatesByTicket([ticket.id])

    res.status(200).json({
      success: true,
      data: {
        ...(typeof ticket.toJSON === 'function' ? ticket.toJSON() : ticket),
        assignedAt: assignedAtByTicket[ticket.id] || null,
        tatUpdatedAt: tatUpdatesByTicket[ticket.id]?.at || null,
        tatUpdatedBy: tatUpdatesByTicket[ticket.id]?.by || null,
        completedAt: ticket.completedAt || ticket.resolvedAt || null,
        closedAt: ticket.closedAt || ticket.verifiedAt || null,
      },
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

    const previousTat = ticket.tatOption

    if (tatOption) ticket.tatOption = tatOption
    if (customTatDeadline) {
      ticket.customTatDeadline = new Date(customTatDeadline)
    } else if (customTatDeadline === null) {
      // Switching back to a preset window clears any exact deadline.
      ticket.customTatDeadline = null
    }

    await ticket.save()

    // Tickets have no `tatUpdatedAt` column, so the change is journalled here
    // and read back for the resident's progress timeline. `performedByUserId`
    // is a foreign key to `users`, and a resident is not a user, so only the
    // staff id is ever written there — residents are recorded by name.
    const staffUserId = req.user?.residentId ? null : req.user?.id || null
    let updatedByName: string | null = req.user?.email || null
    if (req.user?.residentId) {
      const resident = await Resident.findByPk(req.user.residentId)
      if (resident) {
        updatedByName = `${resident.firstName || ''} ${resident.lastName || ''}`.trim() || updatedByName
      }
    }

    await TicketActivityLog.create({
      ticketId: ticket.id,
      performedByUserId: staffUserId,
      performedByName: updatedByName,
      activityType: TicketActivityType.UPDATED,
      comment: `${TAT_LOG_PREFIX} ${previousTat || 'not set'} -> ${ticket.tatOption || 'not set'}`,
      ...(staffUserId ? { createdBy: staffUserId } : {}),
    })

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

    // Record the escalation as first-class data so every app can read it.
    const escalatingUserId = req.user?.residentId || req.user?.id || null
    let escalatedByName: string | null = req.user?.email || null
    if (req.user?.residentId) {
      const resident = await Resident.findByPk(req.user.residentId)
      if (resident) {
        escalatedByName = `${resident.firstName || ''} ${resident.lastName || ''}`.trim() || escalatedByName
      }
    }

    ticket.escalatedAt = new Date()
    ticket.escalatedByUserId = escalatingUserId
    ticket.escalatedByName = escalatedByName
    ticket.escalationReason = String(reason).trim()

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

/**
 * POST /api/v1/mobile/l1/tickets/:id/feedback
 * Resident feedback on a finished ticket. Re-submitting replaces the previous
 * feedback rather than adding a second one.
 */
export async function submitTicketFeedback(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const household = resolveHousehold(req)
    if (!household) {
      res.status(401).json({ success: false, message: 'Authentication required' })
      return
    }

    const rating = String(req.body.rating || '').toUpperCase()
    const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : ''

    if (!Object.values(TicketFeedbackRating).includes(rating as TicketFeedbackRating)) {
      res.status(400).json({
        success: false,
        message: `Rating must be one of ${Object.values(TicketFeedbackRating).join(', ')}`,
      })
      return
    }

    const idStr = String(req.params.id)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idStr)
    const ticket = isUuid ? await Ticket.findByPk(idStr) : await Ticket.findOne({ where: { ticketNumber: idStr } })

    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' })
      return
    }

    // Feedback is about finished work, so it only opens once the ticket is done.
    if (ticket.status !== TicketStatus.RESOLVED && ticket.status !== TicketStatus.CLOSED) {
      res.status(409).json({
        success: false,
        message: 'Feedback can only be given once the ticket is completed',
      })
      return
    }

    const existing = await TicketFeedback.findOne({ where: { ticketId: ticket.id } })

    if (existing) {
      existing.rating = rating
      existing.comment = comment || null
      await existing.save()
      res.status(200).json({ success: true, message: 'Feedback updated', data: existing })
      return
    }

    const feedback = await TicketFeedback.create({
      ticketId: ticket.id,
      residentId: household.residentId,
      familyMemberId: household.familyMemberId,
      rating,
      comment: comment || null,
    })

    res.status(201).json({ success: true, message: 'Thanks for your feedback', data: feedback })
  } catch (err) {
    console.error('Error submitting ticket feedback:', err)
    res.status(500).json({ success: false, message: 'Failed to submit feedback' })
  }
}
