import type { Response } from 'express'
import { Op } from 'sequelize'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { uploadFileToS3 } from '../../../middlewares/s3/index.js'
import {
  Event,
  EventAttendee,
  EventRegistration,
  EventVenue,
  FnbFoodAttendance,
  FnbGlobalMealSlot,
  FnbPropertyMealSlot,
  Resident,
  ResidentDocument,
  ResidentGuardian,
  Role,
  User,
  UserDetail,
  UserLocation,
} from '../../../models/index.js'
import { formatResidentDocument, listResidentDocumentsForResident } from '../../../services/residentDocument.service.js'
import { formatGuardian, listCareRecipients } from '../../../services/residentGuardian.service.js'
import { RegistrationStatus } from '../../../enums/event.enum.js'

const fail = (res: Response, status: number, message: string) => res.status(status).json({ success: false, message })

/** The person a request is for: the guardian's selected resident, or the signed-in resident / family member. */
const personOf = (req: AuthenticatedRequest) => ({
  residentId: req.user?.residentId || req.user?.id || '',
  familyMemberId: req.user?.familyMemberId || null,
})

const ymd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** GET /guardian/me — the guardian, the flat's residents they look after, and who is selected. */
export async function getGuardianMe(req: AuthenticatedRequest, res: Response) {
  try {
    if (!req.user?.guardianId) return fail(res, 403, 'Only guardians can use this.')
    const guardian = await ResidentGuardian.findByPk(req.user.guardianId)
    if (!guardian) return fail(res, 404, 'Guardian not found')
    const careRecipients = await listCareRecipients(guardian.residentId)
    return res.json({
      success: true,
      data: { guardian: formatGuardian(guardian), careRecipients, actingFor: req.user.actingFor ?? null },
    })
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : 'Failed to load guardian')
  }
}

/** GET /guardian/contact-manager — the property admins residents and guardians can contact. */
export async function getContactManager(req: AuthenticatedRequest, res: Response) {
  try {
    const locId = req.locationId || req.user?.defaultLocationId
    if (!locId) return fail(res, 400, 'No property is linked to this account.')
    const rows = (await UserLocation.findAll({
      where: { locId, isActive: true, isDeleted: false },
      include: [
        { model: Role, as: 'role', attributes: ['id', 'code', 'name'], where: { code: 'ADMIN' }, required: true },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'phone', 'username', 'isActive', 'isDeleted'],
          where: { isActive: true, isDeleted: false },
          required: true,
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName', 'phone', 'photoUrl'] }],
        },
      ],
    })) as (UserLocation & { user?: User & { profile?: UserDetail | null } })[]

    const seen = new Set<string>()
    const contacts = rows
      .filter((row) => row.user && !seen.has(row.user.id) && seen.add(row.user.id))
      .map((row) => {
        const user = row.user!
        const profile = user.profile
        return {
          id: user.id,
          name: `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim() || user.username || 'Property Admin',
          role: 'Property Admin',
          phone: profile?.phone || user.phone || null,
          email: user.email || null,
          photoUrl: profile?.photoUrl || null,
        }
      })
    return res.json({ success: true, data: { contacts } })
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : 'Failed to load contacts')
  }
}

/**
 * GET /guardian/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD — the selected person's dine-in meals
 * and the events they attended (default: last 30 days).
 */
export async function getAttendanceHistory(req: AuthenticatedRequest, res: Response) {
  try {
    const { residentId, familyMemberId } = personOf(req)
    if (!residentId) return fail(res, 401, 'Unable to resolve resident')
    const today = new Date()
    const to = typeof req.query.to === 'string' && req.query.to ? req.query.to : ymd(today)
    const fromDefault = new Date(today)
    fromDefault.setDate(fromDefault.getDate() - 30)
    const from = typeof req.query.from === 'string' && req.query.from ? req.query.from : ymd(fromDefault)
    const start = new Date(`${from}T00:00:00`)
    const end = new Date(`${to}T23:59:59.999`)

    const meals = (await FnbFoodAttendance.findAll({
      where: {
        ...(familyMemberId ? { familyMemberId } : { residentId, familyMemberId: null }),
        isGuest: false,
        status: 'attended',
        date: { [Op.between]: [from, to] },
      },
      include: [
        {
          model: FnbPropertyMealSlot,
          as: 'mealSlot',
          required: false,
          include: [{ model: FnbGlobalMealSlot, as: 'globalMealSlot', attributes: ['name', 'startTime', 'endTime'] }],
        },
      ],
      order: [['date', 'DESC']],
    })) as (FnbFoodAttendance & {
      mealSlot?: FnbPropertyMealSlot & {
        globalMealSlot?: FnbGlobalMealSlot | null
        startTime?: string
        endTime?: string
      }
    })[]

    const eventInclude = {
      model: Event,
      as: 'event',
      attributes: ['id', 'title', 'startDate', 'endDate', 'venueId'],
      include: [{ model: EventVenue, as: 'venue', attributes: ['id', 'name'], required: false }],
    }
    const [attendees, walkIns] = await Promise.all([
      EventAttendee.findAll({
        where: { residentId, familyMemberId, markedAt: { [Op.between]: [start, end] } },
        include: [{ model: EventRegistration, as: 'registration', include: [eventInclude] }],
      }) as Promise<(EventAttendee & { registration?: EventRegistration & { event?: Event } })[]>,
      EventRegistration.findAll({
        where: {
          residentId,
          familyMemberId,
          isDeleted: false,
          status: RegistrationStatus.ATTENDED,
          attendedAt: { [Op.between]: [start, end] },
        },
        include: [eventInclude],
      }) as Promise<(EventRegistration & { event?: Event })[]>,
    ])

    const events = new Map<string, Record<string, unknown>>()
    const addEvent = (event: Event | undefined, at: Date | null) => {
      if (!event || events.has(event.id)) return
      events.set(event.id, {
        eventId: event.id,
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
        venue: (event as Event & { venue?: EventVenue | null }).venue?.name ?? null,
        attendedAt: at,
      })
    }
    attendees.forEach((a) => addEvent(a.registration?.event, a.markedAt))
    walkIns.forEach((r) => addEvent(r.event, r.attendedAt))

    return res.json({
      success: true,
      data: {
        from,
        to,
        dining: meals.map((m) => ({
          id: m.id,
          date: String(m.date).slice(0, 10),
          mealSlot: m.mealSlot?.globalMealSlot?.name ?? 'Meal',
          startTime: m.mealSlot?.startTime || m.mealSlot?.globalMealSlot?.startTime || null,
          endTime: m.mealSlot?.endTime || m.mealSlot?.globalMealSlot?.endTime || null,
        })),
        events: Array.from(events.values()).sort(
          (a, b) => new Date(String(b.startDate)).getTime() - new Date(String(a.startDate)).getTime(),
        ),
      },
    })
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : 'Failed to load attendance')
  }
}

/** GET /guardian/documents — the flat's documents, newest first. */
export async function getDocuments(req: AuthenticatedRequest, res: Response) {
  try {
    const { residentId } = personOf(req)
    return res.json({ success: true, data: { documents: await listResidentDocumentsForResident(residentId) } })
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : 'Failed to load documents')
  }
}

/**
 * POST /guardian/documents (multipart: file, name, note?) — stored on the flat's record; the note
 * says who it is for and, for a guardian, who uploaded it.
 */
export async function uploadDocument(req: AuthenticatedRequest, res: Response) {
  try {
    const { residentId } = personOf(req)
    const files = req.files as { [field: string]: Express.Multer.File[] } | undefined
    const file = files?.file?.[0]
    const name = String(req.body?.name || '').trim()
    if (!file) return fail(res, 400, 'Document file is required')
    if (!name) return fail(res, 400, 'Document name is required')
    if (name.length > 255) return fail(res, 400, 'Document name must be 255 characters or fewer')

    const resident = await Resident.findOne({
      where: { id: residentId, isDeleted: false },
      attributes: ['id', 'locId'],
    })
    if (!resident?.locId) return fail(res, 404, 'Resident not found')

    const forWhom = req.user?.actingFor?.fullName
    const byGuardian = req.user?.guardianName
    const note = [
      String(req.body?.note || '').trim(),
      [forWhom ? `For ${forWhom}` : null, byGuardian ? `uploaded by ${byGuardian} (guardian)` : null]
        .filter(Boolean)
        .join(' • '),
    ]
      .filter(Boolean)
      .join('\n')

    const uploaded = await uploadFileToS3(file, 'resident-documents')
    const createdBy = req.user?.guardianId || req.user?.id || null
    const document = await ResidentDocument.create({
      residentId,
      locationId: resident.locId,
      name,
      fileUrl: uploaded.location,
      fileName: file.originalname || null,
      mimeType: file.mimetype || null,
      note: note.slice(0, 5000) || null,
      isActive: true,
      isDeleted: false,
      createdBy,
      updatedBy: createdBy,
    })
    return res
      .status(201)
      .json({ success: true, message: 'Document uploaded successfully', data: formatResidentDocument(document) })
  } catch (error) {
    return fail(res, 500, error instanceof Error ? error.message : 'Failed to upload document')
  }
}
