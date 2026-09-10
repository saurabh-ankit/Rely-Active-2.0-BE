import type { Response } from 'express'
import { Op } from 'sequelize'
import { Department, JobCategory, PropertyUnit, Resident, Ticket, User } from '../../../models/index.js'
import { TicketPriority, TicketStatus } from '../../../enums/ticket.enum.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { uploadFileToS3, uploadBase64ToS3 } from '../../../middlewares/s3/index.js'

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
        ],
      })
    }

    if (!ticket) {
      ticket = await Ticket.findOne({
        where: { ticketNumber: idStr },
        include: [
          { model: PropertyUnit, as: 'unit', required: false },
          { model: User, as: 'assignedToUser', attributes: ['id', 'email'], required: false },
        ],
      })
    }

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
