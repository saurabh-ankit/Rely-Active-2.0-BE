import type { Request, Response } from 'express'
import { Op } from 'sequelize'
import sequelize from '../../config/db/index.js'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import {
  Ticket,
  TicketActivityLog,
  TicketFeedback,
  TicketCategory,
  TicketSubCategory,
  Property,
  PropertyBlock,
  PropertyFloor,
  PropertyUnit,
  Resident,
  ResidentFamilyMember,
  Department,
  JobCategory,
  User,
  UserDetail,
  UserLocation,
  AssetVendor,
  Asset,
} from '../../models/index.js'
import { NotificationRecipientType } from '../../enums/notification.enum.js'
import { ServiceType } from '../../enums/billing.enum.js'
import { invoicedSourceIds } from '../../services/billing/invoicedSources.js'
import { TicketActivityType, TicketPriority, TicketStatus } from '../../enums/ticket.enum.js'
import { uploadFileToS3 } from '../../middlewares/s3/index.js'
import { resolveNotificationActor } from '../../services/notifications/notificationAudience.service.js'
import { getShiftInfoForEmployees } from '../../services/staffShift.service.js'
import {
  endAutoAssignOnManualAssignSafe,
  getAutoAssignLog,
  listAutoAssignSettings,
  saveAutoAssignSettings,
} from '../../services/ticketAutoAssign.service.js'
import { HttpError } from '../../middlewares/error/http-error.js'
import {
  applyWorkDetails,
  getWorkDetailFiles,
  getWorkDetails,
  normalizeAttachments,
  toAmount,
  uploadWorkFiles,
} from '../../services/ticketWork.service.js'
import type {
  AdminCompleteTicketInput,
  CloseTicketInput,
  EditTicketWorkDetailsInput,
} from '../../validations/ticketStaff.validation.js'
import { buildTatUpdatedNotificationContent } from '../../services/notifications/ticketNotificationContent.service.js'
import {
  publishTicketNotificationSafe,
  requestTicketFeedbackSafe,
} from '../../services/notifications/ticketNotification.service.js'

/** A ticket's amount is billed once it is on a live invoice; after that the amount is locked. */
const INVOICED_AMOUNT_MESSAGE = 'An invoice has been generated for this ticket, so its amount cannot be changed'

async function isTicketInvoiced(ticketId: string): Promise<boolean> {
  return (await invoicedSourceIds(ServiceType.MAINTENANCE, [ticketId])).size > 0
}

/** Adds `isInvoiced` to each ticket, so the UI can lock the amount. */
async function withInvoicedFlag(tickets: Ticket[]): Promise<Array<Record<string, unknown>>> {
  const billable = tickets.filter((t) => Number(t.invoiceAmount) > 0).map((t) => t.id)
  const invoiced = await invoicedSourceIds(ServiceType.MAINTENANCE, billable)
  return tickets.map((t) => ({ ...t.toJSON(), isInvoiced: invoiced.has(t.id) }))
}

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
 * Fetch staff that can take this ticket, tagged with how well they match its
 * department / job category so the UI can group them:
 *   JOB_CATEGORY - same department *and* same job category as the ticket
 *   DEPARTMENT   - same department, different job category
 *   OTHER        - everyone else at the property
 * The whole roster is still returned so an admin can override the grouping.
 */
export async function getAssignableEmployees(req: Request, res: Response): Promise<void> {
  try {
    const locId = (req.query.locId || req.query.locationId || req.params.locationId) as string | undefined
    const departmentId = (req.query.departmentId as string | undefined) || undefined
    const jobCategoryId = (req.query.jobCategoryId as string | undefined) || undefined

    const userLocWhere: Record<string, unknown> = { isDeleted: false }
    if (locId) userLocWhere.locId = locId

    // Find every staff member at the property, with their posting
    const userInclude = [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'email', 'username'],
        include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'], required: false }],
      },
      { model: Department, as: 'department', attributes: ['id', 'name', 'code'], required: false },
      { model: JobCategory, as: 'jobCategory', attributes: ['id', 'name'], required: false },
    ]

    const userLocations = (await UserLocation.findAll({
      where: userLocWhere,
      include: userInclude,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any[]

    type MatchLevel = 'JOB_CATEGORY' | 'DEPARTMENT' | 'OTHER'
    const matchRank: Record<MatchLevel, number> = { JOB_CATEGORY: 0, DEPARTMENT: 1, OTHER: 2 }

    interface Candidate {
      id: string
      email: string
      username?: string | undefined
      fullName?: string | undefined
      department: { id: string; name: string } | null
      jobCategory: { id: string; name: string } | null
      matchLevel: MatchLevel
    }

    // A user can hold several postings at the same property; keep the best match.
    const userMap = new Map<string, Candidate>()

    const addUser = (
      u: {
        id: string
        email: string | null
        username?: string | null
        profile?: { firstName?: string | null; lastName?: string | null } | null
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      department?: any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jobCategory?: any,
    ) => {
      const fullName = `${u.profile?.firstName || ''} ${u.profile?.lastName || ''}`.trim()

      let matchLevel: MatchLevel = 'OTHER'
      if (departmentId && department?.id === departmentId) {
        matchLevel = jobCategoryId && jobCategory?.id === jobCategoryId ? 'JOB_CATEGORY' : 'DEPARTMENT'
      }

      const candidate: Candidate = {
        id: u.id,
        email: u.email || 'user@rely.com',
        username: u.username || undefined,
        fullName: fullName || undefined,
        department: department ? { id: department.id, name: department.name } : null,
        jobCategory: jobCategory ? { id: jobCategory.id, name: jobCategory.name } : null,
        matchLevel,
      }

      const existing = userMap.get(u.id)
      if (!existing || matchRank[matchLevel] < matchRank[existing.matchLevel]) {
        userMap.set(u.id, candidate)
      }
    }

    for (const ul of userLocations) {
      if (ul.user) addUser(ul.user, ul.department, ul.jobCategory)
    }

    // Fallback: no postings at all for this property, so offer recent staff users
    if (userMap.size === 0) {
      const allUsers = (await User.findAll({
        limit: 20,
        attributes: ['id', 'email', 'username'],
        include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'], required: false }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any[]
      for (const u of allUsers) addUser(u)
    }

    const shiftByEmployee = await getShiftInfoForEmployees(Array.from(userMap.keys()), locId)

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

        const name = u.fullName || u.username || u.email.split('@')[0] || 'Employee'
        const initials = name.substring(0, 2).toUpperCase()

        return {
          id: u.id,
          name,
          email: u.email,
          initials,
          totalAssigned,
          openCount,
          closedCount,
          shift: shiftByEmployee[u.id] || null,
          department: u.department,
          jobCategory: u.jobCategory,
          matchLevel: u.matchLevel,
        }
      }),
    )

    // Best match first, then whoever is free-est within each group
    employeesWithMetrics.sort((a, b) => {
      const byMatch = matchRank[a.matchLevel] - matchRank[b.matchLevel]
      if (byMatch !== 0) return byMatch
      if (a.shift?.isOnShift !== b.shift?.isOnShift) return a.shift?.isOnShift ? -1 : 1
      if (a.openCount !== b.openCount) return a.openCount - b.openCount
      return a.name.localeCompare(b.name)
    })

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

    // Tab filter: Open, In Progress, Completed (awaiting verification), Closed (verified)
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
      } else if (tab === 'COMPLETED') {
        // Work finished by staff, still waiting for admin verification.
        where.status = TicketStatus.RESOLVED
      } else if (tab === 'CLOSED') {
        where.status = { [Op.in]: [TicketStatus.CLOSED, TicketStatus.CANCELLED] }
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
        {
          model: ResidentFamilyMember,
          as: 'familyMember',
          attributes: ['id', 'firstName', 'lastName', 'relation'],
          required: false,
        },
        { model: Department, as: 'department', required: false },
        { model: JobCategory, as: 'jobCategory', required: false },
        { model: TicketCategory, as: 'categoryObj', required: false },
        { model: TicketSubCategory, as: 'subCategoryObj', required: false },
        {
          model: User,
          as: 'assignedToUser',
          attributes: ['id', 'email', 'username'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
          required: false,
        },
        // Auto-assign: who is being asked to accept it right now
        {
          model: User,
          as: 'offeredToUser',
          attributes: ['id', 'email', 'username'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
          required: false,
        },
        {
          model: User,
          as: 'raisedByUser',
          attributes: ['id', 'email', 'username'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
          required: false,
        },
        {
          model: User,
          as: 'workStartedByUser',
          attributes: ['id', 'email', 'username'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
          required: false,
        },
        {
          model: User,
          as: 'closedByUser',
          attributes: ['id', 'email', 'username'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
          required: false,
        },
        // Who completed / verified it, for the list's "Completed by" line
        {
          model: User,
          as: 'completedByUser',
          attributes: ['id', 'email', 'username'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
          required: false,
        },
        {
          model: User,
          as: 'verifiedByUser',
          attributes: ['id', 'email', 'username'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
          required: false,
        },
        { model: AssetVendor, as: 'vendor', required: false },
        { model: Asset, as: 'asset', required: false },
        { model: TicketFeedback, as: 'feedback', required: false },
      ],
      // Escalated tickets first (newest escalation on top), then the rest by recency.
      order: [
        [sequelize.literal('CASE WHEN Ticket.escalatedAt IS NULL THEN 1 ELSE 0 END'), 'ASC'],
        ['escalatedAt', 'DESC'],
        ['createdAt', 'DESC'],
      ],
      limit: limitNum,
      offset,
      distinct: true,
    })

    res.status(200).json({
      success: true,
      data: await withInvoicedFlag(tickets),
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
    // Same split as the list tabs: an assigned ticket waiting for the staff
    // member to start work counts as In Progress, not Open.
    const open = await Ticket.count({ where: { ...where, status: TicketStatus.OPEN, assignedToUserId: null } })
    const inProgress = await Ticket.count({
      where: {
        ...where,
        [Op.or]: [
          { status: { [Op.in]: [TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD] } },
          { status: TicketStatus.OPEN, assignedToUserId: { [Op.ne]: null } },
        ],
      },
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
        {
          model: ResidentFamilyMember,
          as: 'familyMember',
          attributes: ['id', 'firstName', 'lastName', 'relation'],
          required: false,
        },
        { model: Department, as: 'department' },
        { model: JobCategory, as: 'jobCategory' },
        { model: TicketCategory, as: 'categoryObj' },
        { model: TicketSubCategory, as: 'subCategoryObj' },
        {
          model: User,
          as: 'assignedToUser',
          attributes: ['id', 'email', 'username'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
          required: false,
        },
        // Auto-assign: who is being asked to accept it right now
        {
          model: User,
          as: 'offeredToUser',
          attributes: ['id', 'email', 'username'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
          required: false,
        },
        {
          model: User,
          as: 'raisedByUser',
          attributes: ['id', 'email', 'username'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
          required: false,
        },
        {
          model: User,
          as: 'workStartedByUser',
          attributes: ['id', 'email', 'username'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
          required: false,
        },
        {
          model: User,
          as: 'closedByUser',
          attributes: ['id', 'email', 'username'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
          required: false,
        },
        {
          model: User,
          as: 'completedByUser',
          attributes: ['id', 'email', 'username'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
          required: false,
        },
        {
          model: User,
          as: 'verifiedByUser',
          attributes: ['id', 'email', 'username'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
          required: false,
        },
        { model: AssetVendor, as: 'vendor' },
        { model: Asset, as: 'asset' },
        {
          model: TicketFeedback,
          as: 'feedback',
          required: false,
          include: [
            { model: Resident, as: 'resident', attributes: ['id', 'firstName', 'lastName'], required: false },
            {
              model: ResidentFamilyMember,
              as: 'familyMember',
              attributes: ['id', 'firstName', 'lastName', 'relation'],
              required: false,
            },
          ],
        },
        {
          model: TicketActivityLog,
          as: 'activityLogs',
          include: [
            {
              model: User,
              as: 'performedByUser',
              attributes: ['id', 'email', 'username'],
              include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
              required: false,
            },
          ],
        },
      ],
      order: [[{ model: TicketActivityLog, as: 'activityLogs' }, 'createdAt', 'DESC']],
    })

    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' })
      return
    }

    const [data] = await withInvoicedFlag([ticket])
    res.status(200).json({
      success: true,
      data,
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

    // Store the same shape the resident app writes ({ audioUrl, photos, notes }) so
    // every client can tell a voice note apart from a photo.
    const photoUrls: string[] = Array.isArray(attachments)
      ? attachments.filter((a: unknown): a is string => typeof a === 'string' && a.trim() !== '')
      : []
    let audioUrl: string | null = null

    const files = (req.files || {}) as { [field: string]: Express.Multer.File[] }
    const isAudioFile = (f: Express.Multer.File) =>
      (f.mimetype || '').startsWith('audio/') || /\.(webm|mp3|m4a|wav|ogg|aac)$/i.test(f.originalname || '')

    // `attachment` (older clients) may hold either a voice note or a photo.
    const uploads = [...(files.audio || []), ...(files.attachment || []), ...(files.photos || [])]
    for (const file of uploads) {
      const isAudio = isAudioFile(file)
      const s3Res = await uploadFileToS3(file, isAudio ? 'tickets/audio' : 'tickets/photos')
      if (isAudio && !audioUrl) {
        audioUrl = s3Res.location
      } else if (!isAudio) {
        photoUrls.push(s3Res.location)
      }
    }

    const hasAttachments = Boolean(audioUrl) || photoUrls.length > 0
    const finalAttachments = hasAttachments ? { audioUrl, photos: photoUrls } : null

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
      attachments: finalAttachments,
      createdBy: userId,
    })

    await TicketActivityLog.create({
      ticketId: ticket.id,
      performedByUserId: userId,
      performedByName: userName,
      activityType: TicketActivityType.CREATED,
      toStatus: TicketStatus.OPEN,
      comment: `Ticket created with number ${ticketNumber}`,
      attachments: finalAttachments,
      createdBy: userId,
    })

    // Keep notifications non-blocking: ticket creation should succeed even if
    // inbox fan-out has a temporary issue.
    await publishTicketNotificationSafe({
      ticket,
      eventCode: 'TICKET_CREATED',
      title: 'New ticket created',
      message: `${ticket.title || 'Ticket'} has been created (${ticket.ticketNumber}).`,
      actor: resolveNotificationActor(req, userName),
      dedupeKey: `ticket-created:${ticket.id}`,
      payload: {
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
      },
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

/** Ticket `category` value kept in step with the department a ticket is moved to. */
const DEPARTMENT_CODE_TO_CATEGORY: Record<string, string> = {
  RNM: 'REPAIR_MAINTENANCE',
  CON: 'CONCIERGE',
  HK: 'HOUSEKEEPING',
  FNB: 'FOOD',
}

/**
 * Update Department, Job Category, Category, Sub Category, TAT SLA, and Priority options
 */
export async function updateTicketOptions(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const ticket = await Ticket.findByPk(id)

    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' })
      return
    }

    const {
      categoryId,
      subCategoryId,
      departmentId,
      jobCategoryId,
      tatOption,
      customTatDeadline,
      priority,
      status,
      invoiceAmount,
      resolutionNotes,
    } = req.body
    const userId = req.user?.id || null
    const userName = req.user?.email || 'User'
    const previousStatus = ticket.status
    const previousPriority = ticket.priority
    const previousTatOption = ticket.tatOption

    const updatePayload: Partial<Ticket> = {}
    const routingNotes: string[] = []

    // Re-route a ticket raised under the wrong department / job category.
    if (departmentId !== undefined || jobCategoryId !== undefined) {
      const targetDepartmentId: string | null = departmentId !== undefined ? departmentId || null : ticket.departmentId
      const department = targetDepartmentId ? await Department.findByPk(targetDepartmentId) : null
      if (!department) {
        res.status(400).json({ success: false, message: 'Select a valid department' })
        return
      }

      let jobCategory: JobCategory | null = null
      if (jobCategoryId) {
        jobCategory = await JobCategory.findByPk(jobCategoryId)
        if (!jobCategory || jobCategory.departmentId !== department.id) {
          res.status(400).json({ success: false, message: 'That job category does not belong to the department' })
          return
        }
      }

      if (department.id !== ticket.departmentId) {
        const previousDepartment = ticket.departmentId ? await Department.findByPk(ticket.departmentId) : null
        updatePayload.departmentId = department.id
        updatePayload.category = DEPARTMENT_CODE_TO_CATEGORY[(department.code || '').toUpperCase()] || 'OTHER'
        // Titles start with the department name ("Repair & Maintenance - Flat ..."); keep it in step.
        if (previousDepartment?.name && ticket.title?.startsWith(previousDepartment.name)) {
          updatePayload.title = department.name + ticket.title.slice(previousDepartment.name.length)
        }
        routingNotes.push(`Department: ${previousDepartment?.name || 'None'} → ${department.name}`)
        // A job category from the old department no longer applies.
        if (jobCategoryId === undefined) updatePayload.jobCategoryId = null
      }

      if (jobCategoryId !== undefined && (jobCategory?.id || null) !== ticket.jobCategoryId) {
        const previousJobCategory = ticket.jobCategoryId ? await JobCategory.findByPk(ticket.jobCategoryId) : null
        updatePayload.jobCategoryId = jobCategory?.id || null
        routingNotes.push(`Job category: ${previousJobCategory?.name || 'None'} → ${jobCategory?.name || 'None'}`)
      }
    }

    if (categoryId !== undefined) updatePayload.categoryId = categoryId
    if (subCategoryId !== undefined) updatePayload.subCategoryId = subCategoryId
    const previousTatDeadline = ticket.customTatDeadline || null
    if (tatOption !== undefined) {
      updatePayload.tatOption = tatOption
      if (String(tatOption).toLowerCase() === 'custom') {
        // A custom TAT needs its own deadline, set in the future.
        const deadline = customTatDeadline ? new Date(customTatDeadline) : null
        if (!deadline || Number.isNaN(deadline.getTime())) {
          res.status(400).json({ success: false, message: 'Pick a date and time for the custom TAT' })
          return
        }
        if (deadline.getTime() <= Date.now()) {
          res.status(400).json({ success: false, message: 'The custom TAT must be in the future' })
          return
        }
        updatePayload.customTatDeadline = deadline
      } else {
        // A preset option clears any old custom deadline.
        updatePayload.customTatDeadline = null
      }
    }
    if (priority !== undefined) updatePayload.priority = priority
    // In Progress needs a person on the ticket; that goes through /assign, not a bare status change.
    if (status === TicketStatus.IN_PROGRESS && status !== previousStatus && !ticket.assignedToUserId) {
      res.status(400).json({ success: false, message: 'Assign a staff member to move the ticket to In Progress' })
      return
    }
    // Completing needs the work details (notes, photos, invoice): that goes through /complete.
    const skipsCompletion =
      (status === TicketStatus.RESOLVED && previousStatus !== TicketStatus.RESOLVED) ||
      (status === TicketStatus.CLOSED &&
        previousStatus !== TicketStatus.CLOSED &&
        previousStatus !== TicketStatus.RESOLVED)
    if (skipsCompletion) {
      res.status(400).json({ success: false, message: 'Use Complete Ticket to add the work details first' })
      return
    }
    if (status !== undefined) updatePayload.status = status
    if (invoiceAmount !== undefined) {
      const nextAmount = Number(invoiceAmount) || null
      if (nextAmount !== toAmount(ticket.invoiceAmount) && (await isTicketInvoiced(ticket.id))) {
        res.status(409).json({ success: false, message: INVOICED_AMOUNT_MESSAGE })
        return
      }
      updatePayload.invoiceAmount = nextAmount
    }
    if (resolutionNotes !== undefined) updatePayload.resolutionNotes = resolutionNotes

    await ticket.update(updatePayload)

    await TicketActivityLog.create({
      ticketId: ticket.id,
      performedByUserId: userId,
      performedByName: userName,
      activityType: TicketActivityType.UPDATED,
      comment: routingNotes.length
        ? `Re-routed ticket (${routingNotes.join('; ')})`
        : `Updated options (TAT: ${tatOption || ticket.tatOption}, Priority: ${priority || ticket.priority})`,
      createdBy: userId,
    })

    const tatChanged =
      tatOption !== undefined &&
      (tatOption !== previousTatOption ||
        (ticket.customTatDeadline?.getTime() ?? null) !==
          (previousTatDeadline ? new Date(previousTatDeadline).getTime() : null))
    const statusChanged = status !== undefined && status !== previousStatus

    const tatNotification = tatChanged
      ? buildTatUpdatedNotificationContent({
          ticketTitle: ticket.title,
          ticketNumber: ticket.ticketNumber,
          updatedByName: userName,
          previousTat: { option: previousTatOption, deadline: previousTatDeadline },
          updatedTat: { option: ticket.tatOption, deadline: ticket.customTatDeadline || null },
        })
      : null

    await publishTicketNotificationSafe({
      ticket,
      eventCode: tatChanged ? 'TICKET_TAT_UPDATED' : statusChanged ? 'TICKET_STATUS_UPDATED' : 'TICKET_UPDATED',
      title: tatNotification?.title || 'Ticket updated',
      message:
        tatNotification?.message || `${ticket.title || 'Ticket'} (${ticket.ticketNumber}) was updated by ${userName}.`,
      actor: resolveNotificationActor(req, userName),
      payload: {
        action: tatChanged ? 'TICKET_TAT_UPDATED' : statusChanged ? 'TICKET_STATUS_UPDATED' : 'TICKET_UPDATED',
        previousStatus,
        status: ticket.status,
        previousPriority,
        priority: ticket.priority,
        previousTatOption,
        tatOption: ticket.tatOption,
        ...(tatNotification?.payload || {}),
      },
    })
    // Closed from the web without the verify step: ask for feedback the same way
    if (statusChanged && ticket.status === TicketStatus.CLOSED) {
      await requestTicketFeedbackSafe({
        ticket,
        actor: resolveNotificationActor(req, userName),
        closedByName: userName,
      })
    }

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
 * PATCH /tickets/:id/verify
 * Admin verification of a completed ticket: reviews the resident's request and the
 * staff completion report, then closes the ticket. RESOLVED -> CLOSED.
 */
export async function verifyTicket(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const ticket = await Ticket.findByPk(id)

    if (!ticket) {
      res.status(404).json({ success: false, message: 'Ticket not found' })
      return
    }

    if (ticket.verifiedAt) {
      res.status(409).json({ success: false, message: 'This ticket has already been verified' })
      return
    }
    if (ticket.status !== TicketStatus.RESOLVED) {
      res.status(409).json({
        success: false,
        message: `Only completed tickets can be verified. This ticket is ${ticket.status}.`,
      })
      return
    }

    const userId = req.user?.id || null
    const verifierName = req.user?.email || 'Admin'
    const { verificationNotes } = (req.body || {}) as { verificationNotes?: string }
    const previousStatus = ticket.status
    const verifiedAt = new Date()

    ticket.status = TicketStatus.CLOSED
    ticket.closedAt = verifiedAt
    ticket.verifiedAt = verifiedAt
    ticket.verifiedByUserId = userId
    if (verificationNotes && verificationNotes.trim()) {
      ticket.verificationNotes = verificationNotes.trim()
    }
    ticket.updatedBy = userId
    await ticket.save()

    await TicketActivityLog.create({
      ticketId: ticket.id,
      performedByUserId: userId,
      performedByName: verifierName,
      activityType: TicketActivityType.STATUS_CHANGE,
      fromStatus: previousStatus,
      toStatus: TicketStatus.CLOSED,
      comment: verificationNotes?.trim()
        ? `Work verified by ${verifierName}: ${verificationNotes.trim()}`
        : `Work verified by ${verifierName}`,
      createdBy: userId,
    })

    await publishTicketNotificationSafe({
      ticket,
      eventCode: 'TICKET_VERIFIED',
      title: 'Ticket verified and closed',
      message: `${ticket.title || 'Ticket'} (${ticket.ticketNumber}) was verified and closed by ${verifierName}.`,
      actor: resolveNotificationActor(req, verifierName),
      payload: {
        previousStatus,
        status: ticket.status,
        verificationNotes: ticket.verificationNotes || null,
      },
    })
    await requestTicketFeedbackSafe({
      ticket,
      actor: resolveNotificationActor(req, verifierName),
      closedByName: verifierName,
    })

    res.status(200).json({
      success: true,
      message: 'Ticket verified and closed successfully',
      data: ticket,
    })
  } catch (error) {
    console.error('Error verifying ticket:', error)
    res.status(500).json({ success: false, message: 'Failed to verify ticket' })
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
    const previousStatus = ticket.status

    // Assigning does not start the work: the ticket stays OPEN until the
    // assigned staff member taps "Start Work" in the L3 app.
    await ticket.update({
      assignedToUserId: assignTarget,
      approvedByUserId: userId,
      approvedAt: new Date(),
      departmentId: departmentId !== undefined ? departmentId : ticket.departmentId,
      jobCategoryId: jobCategoryId !== undefined ? jobCategoryId : ticket.jobCategoryId,
      vendorId: vendorId !== undefined ? vendorId : ticket.vendorId,
      updatedBy: userId,
    })

    // A manual assign withdraws any open auto-assign offer
    await endAutoAssignOnManualAssignSafe(ticket.id, userId)

    await TicketActivityLog.create({
      ticketId: ticket.id,
      performedByUserId: userId,
      performedByName: userName,
      activityType: TicketActivityType.ASSIGNED,
      fromStatus: previousStatus,
      toStatus: ticket.status,
      comment: `Ticket assigned to employee`,
      createdBy: userId,
    })

    const assignedUser = await User.findByPk(assignTarget, {
      attributes: ['id', 'username', 'email'],
      include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'], required: false }],
    })

    const assignedUserWithProfile = assignedUser as (User & { profile?: UserDetail | null }) | null

    const assignedName = assignedUserWithProfile
      ? `${assignedUserWithProfile.profile?.firstName || ''} ${assignedUserWithProfile.profile?.lastName || ''}`.trim() ||
        assignedUserWithProfile.username ||
        assignedUserWithProfile.email ||
        'assigned staff'
      : 'assigned staff'

    const directRecipients = [] as Array<{ recipientType: NotificationRecipientType; recipientUserId: string }>
    if (userId) {
      directRecipients.push({
        recipientType: NotificationRecipientType.USER,
        recipientUserId: userId,
      })
    }
    if (assignTarget) {
      directRecipients.push({
        recipientType: NotificationRecipientType.USER,
        recipientUserId: assignTarget,
      })
    }

    await publishTicketNotificationSafe({
      ticket,
      eventCode: 'TICKET_ASSIGNED',
      title: 'Ticket assigned',
      message: `${ticket.title || 'Ticket'} (${ticket.ticketNumber}) was assigned to ${assignedName}.`,
      actor: resolveNotificationActor(req, userName),
      payload: {
        status: ticket.status,
        previousStatus,
        assignedToUserId: assignTarget,
        assignedByUserId: userId,
      },
      extraRecipients: directRecipients,
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

    await publishTicketNotificationSafe({
      ticket,
      eventCode: 'TICKET_COMMENT_ADDED',
      title: 'Ticket comment added',
      message: `${userName} added a comment on ${ticket.title || 'ticket'} (${ticket.ticketNumber}).`,
      actor: resolveNotificationActor(req, userName),
      payload: {
        comment: comment || null,
        attachments: finalAttachments,
      },
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

// ── Auto-assign ─────────────────────────────────────────────────────────────

function sendAutoAssignError(res: Response, error: unknown, label: string): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ success: false, message: error.message })
    return
  }
  console.error(label, error)
  res.status(500).json({ success: false, message: 'Something went wrong' })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The property: the URL path, `?locationId=` / `?locId=`, the body, or the dashboard's `x-location-id` header. */
function resolveAutoAssignLocationId(req: Request): string {
  const header = req.headers['x-location-id'] || req.headers['x-property-id']
  const candidates = [
    req.params.locationId,
    req.query.locationId,
    req.query.locId,
    req.body?.locationId,
    Array.isArray(header) ? header[0] : header,
  ]
  const locationId = candidates.find((value): value is string => typeof value === 'string' && UUID_RE.test(value))
  if (!locationId) throw new HttpError(400, 'locationId is required')
  return locationId
}

/**
 * GET /location/:locationId/tickets/auto-assign-settings
 * The auto-assign toggle and response time for each department of the property.
 */
export async function getTicketAutoAssignSettings(req: Request, res: Response): Promise<void> {
  try {
    const locationId = resolveAutoAssignLocationId(req)
    res.status(200).json({ success: true, data: await listAutoAssignSettings(locationId) })
  } catch (error) {
    sendAutoAssignError(res, error, 'Error fetching ticket auto-assign settings:')
  }
}

/**
 * PUT /location/:locationId/tickets/auto-assign-settings
 * Body: { settings: [{ departmentId, isEnabled, responseTimeoutMinutes? }] }
 */
export async function updateTicketAutoAssignSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const locationId = resolveAutoAssignLocationId(req)
    const raw = Array.isArray(req.body?.settings) ? req.body.settings : [req.body]
    const items = (raw as Array<Record<string, unknown>>).map((item) => {
      const departmentId = String(item?.departmentId || '')
      if (!UUID_RE.test(departmentId)) throw new HttpError(400, 'Each setting needs a valid departmentId')
      if (typeof item.isEnabled !== 'boolean') throw new HttpError(400, 'isEnabled must be true or false')
      let responseTimeoutMinutes: number | undefined
      if (item.responseTimeoutMinutes !== undefined && item.responseTimeoutMinutes !== null) {
        responseTimeoutMinutes = Number(item.responseTimeoutMinutes)
        if (!Number.isInteger(responseTimeoutMinutes) || responseTimeoutMinutes < 1 || responseTimeoutMinutes > 60) {
          throw new HttpError(400, 'Response time must be a whole number of minutes between 1 and 60')
        }
      }
      return { departmentId, isEnabled: item.isEnabled, responseTimeoutMinutes }
    })
    if (items.length === 0) throw new HttpError(400, 'No settings to save')

    const data = await saveAutoAssignSettings(locationId, items, req.user?.id || null)
    res.status(200).json({ success: true, message: 'Auto-assign settings saved', data })
  } catch (error) {
    sendAutoAssignError(res, error, 'Error saving ticket auto-assign settings:')
  }
}

/**
 * GET /tickets/:id/auto-assign-log
 * Who the ticket was offered to, in order, and what each staff member answered.
 */
export async function getTicketAutoAssignLog(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    if (!UUID_RE.test(id)) throw new HttpError(400, 'Valid ticket ID is required')
    res.status(200).json({ success: true, data: await getAutoAssignLog(id) })
  } catch (error) {
    sendAutoAssignError(res, error, 'Error fetching ticket auto-assign log:')
  }
}

// ── Admin doing the work (self-assigned) or completing it for staff ─────────

/** Statuses a ticket can be started or completed from on the web. */
const WEB_WORK_FROM: TicketStatus[] = [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD]

/** Profile name of a user, falling back to their username / email. */
async function getUserDisplayName(userId: string | null | undefined, fallback: string): Promise<string> {
  if (!userId) return fallback
  const user = (await User.findByPk(userId, {
    attributes: ['id', 'username', 'email'],
    include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'], required: false }],
  })) as (User & { profile?: UserDetail | null }) | null
  if (!user) return fallback
  return (
    `${user.profile?.firstName || ''} ${user.profile?.lastName || ''}`.trim() || user.username || user.email || fallback
  )
}

function sendTicketError(res: Response, err: unknown, logLabel: string): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, message: err.message })
    return
  }
  console.error(logLabel, err)
  res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' })
}

function assertWorkableStatus(ticket: Ticket, action: string): void {
  if (!WEB_WORK_FROM.includes(ticket.status)) {
    throw new HttpError(409, `Cannot ${action} a ticket that is ${ticket.status}`)
  }
}

/**
 * POST /tickets/:id/start-work
 * The admin starts work on a ticket assigned to themselves, the same step staff
 * take with "Start Work" in the L3 app.
 */
export async function startTicketWork(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) throw new HttpError(401, 'Authentication required')
    const id = req.params.id as string
    const actorName = await getUserDisplayName(userId, req.user?.email || 'Admin')

    const { ticket, previousStatus } = await sequelize.transaction(async (transaction) => {
      const t = await Ticket.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE })
      if (!t) throw new HttpError(404, 'Ticket not found')
      if (t.assignedToUserId !== userId) {
        throw new HttpError(403, 'Only the assigned person can start work on this ticket')
      }
      if (t.workStartedAt) throw new HttpError(409, 'Work has already started on this ticket')
      assertWorkableStatus(t, 'start work on')

      const fromStatus = t.status
      t.status = TicketStatus.IN_PROGRESS
      t.workStartedAt = new Date()
      t.workStartedByUserId = userId
      t.updatedBy = userId
      await t.save({ transaction })

      await TicketActivityLog.create(
        {
          ticketId: t.id,
          performedByUserId: userId,
          performedByName: actorName,
          activityType: TicketActivityType.STATUS_CHANGE,
          fromStatus,
          toStatus: TicketStatus.IN_PROGRESS,
          comment: `Work started by ${actorName}`,
          createdBy: userId,
        },
        { transaction },
      )
      return { ticket: t, previousStatus: fromStatus }
    })

    await publishTicketNotificationSafe({
      ticket,
      eventCode: 'TICKET_WORK_STARTED',
      title: 'Ticket work started',
      message: `${ticket.title || 'Ticket'} (${ticket.ticketNumber}) work has started.`,
      actor: resolveNotificationActor(req, actorName),
      payload: {
        previousStatus,
        status: ticket.status,
        workStartedAt: ticket.workStartedAt,
        workStartedByUserId: userId,
      },
    })

    res.status(200).json({ success: true, message: 'Work started', data: ticket })
  } catch (err: unknown) {
    sendTicketError(res, err, 'Error starting ticket work:')
  }
}

/**
 * POST /tickets/:id/complete  (JSON or multipart/form-data)
 * Fields: notes (required), invoiceAmount?, close?; files: photos[] (max 10), voiceNotes[] (max 5).
 * The same details staff submit from L3.
 * - Own ticket: closed straight away (no point verifying your own work).
 * - Someone else's ticket: Completed, logged as done on their behalf, and still needs
 *   Verify & Close, unless `close` is set (the admin picked "Closed").
 * Work that was never started is marked started at completion.
 */
export async function completeTicketWork(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) throw new HttpError(401, 'Authentication required')
    const id = req.params.id as string
    const { notes, invoiceAmount, close } = req.body as AdminCompleteTicketInput
    const actorName = await getUserDisplayName(userId, req.user?.email || 'Admin')
    const actor = { userId, staffName: actorName }

    // Check before uploading, so a rejected request never reaches S3
    const existing = await Ticket.findByPk(id)
    if (!existing) throw new HttpError(404, 'Ticket not found')
    if (!existing.assignedToUserId) throw new HttpError(400, 'Assign the ticket to someone before completing it')
    assertWorkableStatus(existing, 'complete')

    const { photoFiles, voiceNoteFiles } = getWorkDetailFiles(req)
    const [photos, voiceNotes] = await Promise.all([
      uploadWorkFiles(photoFiles, `tickets/${id}/photos`, actor),
      uploadWorkFiles(voiceNoteFiles, `tickets/${id}/voice-notes`, actor),
    ])

    const result = await sequelize.transaction(async (transaction) => {
      const t = await Ticket.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE })
      if (!t) throw new HttpError(404, 'Ticket not found')
      if (!t.assignedToUserId) throw new HttpError(400, 'Assign the ticket to someone before completing it')
      assertWorkableStatus(t, 'complete')

      const isSelf = t.assignedToUserId === userId
      const assigneeName = isSelf ? actorName : await getUserDisplayName(t.assignedToUserId, 'the assigned staff')
      const closeNow = isSelf || close === true
      const fromStatus = t.status
      const now = new Date()

      if (!t.workStartedAt) {
        t.workStartedAt = now
        t.workStartedByUserId = userId
        await TicketActivityLog.create(
          {
            ticketId: t.id,
            performedByUserId: userId,
            performedByName: actorName,
            activityType: TicketActivityType.STATUS_CHANGE,
            fromStatus,
            toStatus: TicketStatus.IN_PROGRESS,
            comment: `Work start recorded by ${actorName} while completing the ticket`,
            createdBy: userId,
          },
          { transaction },
        )
      }

      await applyWorkDetails(t, actor, { invoiceAmount, photos, voiceNotes }, transaction)

      t.status = closeNow ? TicketStatus.CLOSED : TicketStatus.RESOLVED
      t.completedAt = now
      t.completedByUserId = userId
      t.resolvedAt = now
      t.resolutionNotes = notes
      if (closeNow) {
        t.closedAt = now
        t.verifiedAt = now
        t.verifiedByUserId = userId
      }
      t.updatedBy = userId
      await t.save({ transaction })

      const who = isSelf ? actorName : `${actorName} on behalf of ${assigneeName}`
      await TicketActivityLog.create(
        {
          ticketId: t.id,
          performedByUserId: userId,
          performedByName: actorName,
          activityType: TicketActivityType.STATUS_CHANGE,
          fromStatus,
          toStatus: t.status,
          comment: `Work completed${closeNow ? ' and closed' : ''} by ${who}: ${notes}`,
          createdBy: userId,
        },
        { transaction },
      )
      return { ticket: t, closeNow, fromStatus }
    })

    const { ticket, closeNow, fromStatus } = result
    await publishTicketNotificationSafe({
      ticket,
      eventCode: closeNow ? 'TICKET_VERIFIED' : 'TICKET_RESOLVED',
      title: closeNow ? 'Ticket completed and closed' : 'Ticket resolved',
      message: `${ticket.title || 'Ticket'} (${ticket.ticketNumber}) was ${closeNow ? 'completed and closed' : 'marked completed'} by ${actorName}.`,
      actor: resolveNotificationActor(req, actorName),
      payload: {
        previousStatus: fromStatus,
        status: ticket.status,
        completedAt: ticket.completedAt,
        completedByUserId: userId,
        notes,
      },
    })
    if (closeNow) {
      await requestTicketFeedbackSafe({
        ticket,
        actor: resolveNotificationActor(req, actorName),
        closedByName: actorName,
      })
    }

    res.status(200).json({
      success: true,
      message: closeNow ? 'Ticket completed and closed' : 'Ticket completed',
      data: ticket,
    })
  } catch (err: unknown) {
    sendTicketError(res, err, 'Error completing ticket:')
  }
}

/** Most files a ticket's work details can hold (same as one L3 upload). */
const MAX_WORK_PHOTOS = 10
const MAX_WORK_VOICE_NOTES = 5

/**
 * PATCH /tickets/:id/work-details  (multipart/form-data)
 * Fields: notes?, invoiceAmount? (blank clears it), removePhotoUrls[]?, removeVoiceNoteUrls[]?;
 * files: photos[], voiceNotes[].
 * Lets an admin correct a completed ticket's report (the same fields as completing it)
 * before it is verified. Removed files stay in storage; the activity log keeps the trail.
 */
export async function editTicketWorkDetails(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) throw new HttpError(401, 'Authentication required')
    const id = req.params.id as string
    const {
      notes,
      invoiceAmount,
      removePhotoUrls = [],
      removeVoiceNoteUrls = [],
    } = req.body as EditTicketWorkDetailsInput
    const actorName = await getUserDisplayName(userId, req.user?.email || 'Admin')
    const actor = { userId, staffName: actorName }
    const { photoFiles, voiceNoteFiles } = getWorkDetailFiles(req)

    const assertEditable = (t: Ticket) => {
      if (t.status !== TicketStatus.RESOLVED) {
        throw new HttpError(409, 'Work details can only be edited on completed tickets')
      }
      const current = getWorkDetails(t.attachments)
      const keptPhotos = current.photos.filter((p) => !removePhotoUrls.includes(p.url))
      if (keptPhotos.length + photoFiles.length > MAX_WORK_PHOTOS) {
        throw new HttpError(400, `A ticket can have up to ${MAX_WORK_PHOTOS} photos`)
      }
      const keptVoice = current.voiceNotes.filter((v) => !removeVoiceNoteUrls.includes(v.url))
      if (keptVoice.length + voiceNoteFiles.length > MAX_WORK_VOICE_NOTES) {
        throw new HttpError(400, `A ticket can have up to ${MAX_WORK_VOICE_NOTES} voice notes`)
      }
    }

    // Check before uploading, so a rejected request never reaches S3
    const existing = await Ticket.findByPk(id)
    if (!existing) throw new HttpError(404, 'Ticket not found')
    assertEditable(existing)
    const changesAmount = invoiceAmount !== undefined && invoiceAmount !== toAmount(existing.invoiceAmount)
    if (changesAmount && (await isTicketInvoiced(id))) throw new HttpError(409, INVOICED_AMOUNT_MESSAGE)

    const [photos, voiceNotes] = await Promise.all([
      uploadWorkFiles(photoFiles, `tickets/${id}/photos`, actor),
      uploadWorkFiles(voiceNoteFiles, `tickets/${id}/voice-notes`, actor),
    ])

    const ticket = await sequelize.transaction(async (transaction) => {
      const t = await Ticket.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE })
      if (!t) throw new HttpError(404, 'Ticket not found')
      assertEditable(t)

      const changes: string[] = []
      const current = getWorkDetails(t.attachments)
      const removedPhotos = current.photos.filter((p) => removePhotoUrls.includes(p.url))
      const removedVoiceNotes = current.voiceNotes.filter((v) => removeVoiceNoteUrls.includes(v.url))
      if (removedPhotos.length || photos.length || removedVoiceNotes.length || voiceNotes.length) {
        // New arrays, so Sequelize sees the JSON column as changed
        t.attachments = {
          ...normalizeAttachments(t.attachments),
          workDetails: {
            photos: [...current.photos.filter((p) => !removePhotoUrls.includes(p.url)), ...photos],
            voiceNotes: [...current.voiceNotes.filter((v) => !removeVoiceNoteUrls.includes(v.url)), ...voiceNotes],
          },
        }
        t.changed('attachments', true)
        if (photos.length) changes.push(`${photos.length} photo(s) added`)
        if (removedPhotos.length) changes.push(`${removedPhotos.length} photo(s) removed`)
        if (voiceNotes.length) changes.push(`${voiceNotes.length} voice note(s) added`)
        if (removedVoiceNotes.length) changes.push(`${removedVoiceNotes.length} voice note(s) removed`)
      }

      const previousNotes = t.resolutionNotes || null
      if (notes !== undefined && notes !== previousNotes) {
        t.resolutionNotes = notes
        changes.push('resolution notes updated')
      }

      const previousAmount = toAmount(t.invoiceAmount)
      if (invoiceAmount !== undefined && invoiceAmount !== previousAmount) {
        t.invoiceAmount = invoiceAmount
        changes.push(
          `invoice amount ${previousAmount === null ? 'none' : previousAmount} → ${invoiceAmount === null ? 'none' : invoiceAmount}`,
        )
      }

      if (!changes.length) throw new HttpError(400, 'Nothing to update')

      t.updatedBy = userId
      await t.save({ transaction })
      await TicketActivityLog.create(
        {
          ticketId: t.id,
          performedByUserId: userId,
          performedByName: actorName,
          activityType:
            photos.length || voiceNotes.length ? TicketActivityType.ATTACHMENT_ADDED : TicketActivityType.UPDATED,
          comment: `Work details edited by ${actorName}: ${changes.join(', ')}`,
          attachments: {
            ...(invoiceAmount !== undefined ? { previousInvoiceAmount: previousAmount, invoiceAmount } : {}),
            ...(notes !== undefined && notes !== previousNotes ? { previousNotes, notes } : {}),
            photosAdded: photos,
            photosRemoved: removedPhotos,
            voiceNotesAdded: voiceNotes,
            voiceNotesRemoved: removedVoiceNotes,
          },
          createdBy: userId,
        },
        { transaction },
      )
      return t
    })

    res.status(200).json({ success: true, message: 'Work details updated', data: ticket })
  } catch (err: unknown) {
    sendTicketError(res, err, 'Error editing ticket work details:')
  }
}

/**
 * POST /tickets/:id/close   Body: { reason }
 * Closes an Open / In Progress ticket without completing it, e.g. raised by mistake or a
 * duplicate. Saved as CANCELLED (shown as "Closed"), so it is never billed and the resident
 * is not asked for feedback. The timeline shows only the steps that happened, then Closed.
 */
export async function closeTicketWithoutCompletion(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) throw new HttpError(401, 'Authentication required')
    const id = req.params.id as string
    const { reason } = req.body as CloseTicketInput
    const actorName = await getUserDisplayName(userId, req.user?.email || 'Admin')

    const { ticket, previousStatus } = await sequelize.transaction(async (transaction) => {
      const t = await Ticket.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE })
      if (!t) throw new HttpError(404, 'Ticket not found')
      if (!WEB_WORK_FROM.includes(t.status)) {
        throw new HttpError(409, 'Only Open or In Progress tickets can be closed this way')
      }

      const fromStatus = t.status
      const now = new Date()
      t.status = TicketStatus.CANCELLED
      t.closedAt = now
      t.closedByUserId = userId
      t.closeReason = reason
      t.updatedBy = userId
      await t.save({ transaction })

      await TicketActivityLog.create(
        {
          ticketId: t.id,
          performedByUserId: userId,
          performedByName: actorName,
          activityType: TicketActivityType.STATUS_CHANGE,
          fromStatus,
          toStatus: TicketStatus.CANCELLED,
          comment: `Closed without completion by ${actorName}: ${reason}`,
          createdBy: userId,
        },
        { transaction },
      )
      return { ticket: t, previousStatus: fromStatus }
    })

    // A pending auto-assign offer no longer applies
    await endAutoAssignOnManualAssignSafe(ticket.id, userId, 'Ticket closed')

    await publishTicketNotificationSafe({
      ticket,
      eventCode: 'TICKET_CLOSED',
      title: 'Ticket closed',
      message: `${ticket.title || 'Ticket'} (${ticket.ticketNumber}) was closed by ${actorName}: ${reason}`,
      actor: resolveNotificationActor(req, actorName),
      payload: { previousStatus, status: ticket.status, closeReason: reason, closedByUserId: userId },
    })

    res.status(200).json({ success: true, message: 'Ticket closed', data: ticket })
  } catch (err: unknown) {
    sendTicketError(res, err, 'Error closing ticket:')
  }
}
