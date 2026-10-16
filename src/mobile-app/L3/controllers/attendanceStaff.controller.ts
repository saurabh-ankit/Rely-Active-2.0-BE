import type { NextFunction, Request, Response } from 'express'
import { Op } from 'sequelize'
import { EventType, RegistrationStatus } from '../../../enums/event.enum.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import {
  Department,
  Event,
  EventAttendee,
  EventRegistration,
  EventRequest,
  EventVenue,
  PropertyUnit,
  Resident,
  ResidentFamilyMember,
  User,
  UserDetail,
  UserLocation,
} from '../../../models/index.js'
import { AuthorizationService } from '../../../services/authorization.service.js'
import { localDay, localDayBounds, todayDay } from '../../../utils/billing/dates.js'

/** Department whose staff mark residents' dine-in and event attendance. */
export const ATTENDANCE_DEPARTMENT_CODE = 'ATT'

/** Registrations the attendance staff work with: booked ones, and ones already marked. */
const MARKABLE_STATUSES = [RegistrationStatus.CONFIRMED, RegistrationStatus.ATTENDED, RegistrationStatus.NO_SHOW]

const userId = (req: Request) => (req as AuthenticatedRequest).user?.id ?? null

/** Only Attendance department staff (and super admins) may mark attendance. */
export async function requireAttendanceStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = userId(req)
    if (!id) {
      res.status(401).json({ success: false, message: 'Not authenticated' })
      return
    }
    const ctx = await AuthorizationService.getUserAuthorizationContext(id)
    if (ctx.isSuperAdmin) return next()
    const inAttendance = await UserLocation.count({
      where: { userId: id, isDeleted: false },
      include: [{ model: Department, as: 'department', where: { code: ATTENDANCE_DEPARTMENT_CODE }, required: true }],
    })
    if (!inAttendance) {
      res.status(403).json({ success: false, message: 'Only Attendance staff can mark attendance.' })
      return
    }
    next()
  } catch (error) {
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Access check failed' })
  }
}

const propertyOf = (req: Request) =>
  String(req.query.locId || req.query.locationId || req.headers['x-property-id'] || '').trim()

const fullName = (p?: { firstName?: string | null; lastName?: string | null } | null) =>
  `${p?.firstName ?? ''} ${p?.lastName ?? ''}`.trim()

type MarkerUser = User & { profile?: UserDetail | null }
type AttendeeRow = EventAttendee & { marker?: MarkerUser | null }
type RegistrationRow = EventRegistration & {
  resident?: Resident & { unit?: PropertyUnit | null; familyMembers?: ResidentFamilyMember[] }
  attendanceMarker?: MarkerUser
  attendees?: AttendeeRow[]
}

const markerName = (u?: MarkerUser | null) => (u ? fullName(u.profile) || 'Staff' : null)

/** People a reservation covers: the resident and their residing family members, with who came. */
const reservationPeople = (r: RegistrationRow) => {
  const attendees = r.attendees ?? []
  const person = (familyMemberId: string | null, name: string, relation: string | null) => {
    const a = attendees.find((x) => (x.familyMemberId ?? null) === familyMemberId)
    return {
      familyMemberId,
      name,
      relation,
      attended: !!a,
      markedAt: a?.markedAt ?? null,
      markedBy: markerName(a?.marker),
    }
  }
  return [
    person(null, r.resident ? fullName(r.resident) : 'Resident', null),
    ...(r.resident?.familyMembers ?? []).map((f) => person(f.id, fullName(f), f.relation ?? null)),
  ]
}

const serializeRegistration = (r: RegistrationRow) => ({
  id: r.id,
  status: r.status,
  seatCount: Number(r.seatCount) || 1,
  attendedAt: r.attendedAt,
  markedBy: markerName(r.attendanceMarker),
  /** People marked as came; at most seatCount. */
  attendedCount: (r.attendees ?? []).length,
  people: reservationPeople(r),
  resident: r.resident
    ? {
        id: r.resident.id,
        name: fullName(r.resident),
        phone: r.resident.phone ?? null,
        photoUrl: r.resident.photoUrl ?? null,
        unitNumber: r.resident.unit?.unit_number ?? null,
      }
    : null,
})

/** Ids among `eventIds` that were confirmed from a resident's request. */
async function residentRequestEventIds(eventIds: string[]): Promise<Set<string>> {
  if (!eventIds.length) return new Set()
  const rows = await EventRequest.findAll({
    where: { confirmedEventId: eventIds },
    attributes: ['confirmedEventId'],
  })
  return new Set(rows.map((r) => r.confirmedEventId as string))
}

/**
 * GET /attendance/events?locId= — today's regular and special events with registered residents.
 * Events raised by residents are not listed: their attendance is not marked.
 */
export async function getTodayEvents(req: Request, res: Response): Promise<void> {
  try {
    const locationId = propertyOf(req)
    if (!locationId) {
      res.status(400).json({ success: false, message: 'locId is required' })
      return
    }
    const day = todayDay()
    const [dayStart, dayEnd] = localDayBounds(day, day)
    const events = await Event.findAll({
      where: {
        locationId,
        isDeleted: false,
        startDate: { [Op.lte]: dayEnd },
        endDate: { [Op.gte]: dayStart },
      },
      include: [
        { model: EventVenue, as: 'venue', attributes: ['id', 'name'], required: false },
        {
          model: EventRegistration,
          as: 'registrations',
          attributes: ['id', 'status', 'seatCount'],
          where: { isDeleted: false, status: { [Op.in]: MARKABLE_STATUSES } },
          required: false,
          include: [{ model: EventAttendee, as: 'attendees', attributes: ['id'], required: false }],
        },
      ],
      order: [['startDate', 'ASC']],
    })
    // Events with reservations list their registered residents; events without reservations are
    // open to every residing resident, so they are always listed.
    const fromRequests = await residentRequestEventIds(events.map((e) => e.id))
    const listed = events.filter(
      (e) =>
        !fromRequests.has(e.id) &&
        (!e.allowReservation || ((e as Event & { registrations?: EventRegistration[] }).registrations ?? []).length),
    )
    // Open events count people: residing residents plus their residing family members.
    const residingCount = listed.some((e) => !e.allowReservation)
      ? (await Resident.count({ where: { locId: locationId, isResiding: true, isDeleted: false } })) +
        (await ResidentFamilyMember.count({
          where: { isDeleted: false, isResiding: true },
          include: [
            {
              model: Resident,
              as: 'resident',
              attributes: [],
              where: { locId: locationId, isResiding: true, isDeleted: false },
              required: true,
            },
          ],
        }))
      : 0
    res.json({
      success: true,
      data: {
        date: day,
        events: listed.map((e) => {
          const regs = (e as Event & { registrations?: EventRegistration[] }).registrations ?? []
          const seats = (rows: EventRegistration[]) => rows.reduce((s, r) => s + (Number(r.seatCount) || 1), 0)
          const attended = regs.filter((r) => r.status === RegistrationStatus.ATTENDED)
          return {
            id: e.id,
            title: e.title,
            eventType: e.eventType ?? EventType.REGULAR,
            /** Ended: attendance is read-only. */
            ended: hasEnded(e),
            startDate: e.startDate,
            endDate: e.endDate,
            poster: e.poster ?? null,
            venue: (e as Event & { venue?: EventVenue | null }).venue?.name ?? null,
            entryFee: Number(e.entryFee) || 0,
            /** No reservations: any residing resident may attend; staff mark whoever comes. */
            openToAll: !e.allowReservation,
            registrations: regs.length,
            bookedSeats: e.allowReservation ? seats(regs) : null,
            // Reservations: people marked as came (older whole-reservation marks count their seats).
            attendedSeats: e.allowReservation
              ? regs.reduce((n, r) => {
                  const marked = ((r as RegistrationRow).attendees ?? []).length
                  if (marked) return n + marked
                  return n + (r.status === RegistrationStatus.ATTENDED ? Number(r.seatCount) || 1 : 0)
                }, 0)
              : seats(attended),
            /** Open events: people (residents + family members) marked, and how many live there. */
            attendedPeople: attended.length,
            residingPeople: e.allowReservation ? null : residingCount,
            pending: e.allowReservation ? regs.filter((r) => r.status === RegistrationStatus.CONFIRMED).length : 0,
          }
        }),
      },
    })
  } catch (error) {
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Failed to load events' })
  }
}

type EventLookup = { event: Event; error?: undefined } | { event?: undefined; error: string; code: number }

/** Once an event's end time has passed its attendance is final and can't be changed. */
const hasEnded = (event: Event) => !!event.endDate && new Date(event.endDate).getTime() < Date.now()

const ENDED_MESSAGE = 'This event has ended: attendance can no longer be changed.'

/** Loads an event whose attendance is marked; `forChange` also refuses an event that has ended. */
async function findMarkableEvent(eventId: string, forChange = false): Promise<EventLookup> {
  const event = await Event.findOne({ where: { id: eventId, isDeleted: false } })
  if (!event) return { error: 'Event not found', code: 404 }
  if ((await residentRequestEventIds([event.id])).size) {
    return { error: 'Attendance is not marked for events requested by residents.', code: 400 }
  }
  if (forChange && hasEnded(event)) return { error: ENDED_MESSAGE, code: 400 }
  return { event }
}

const registrationIncludes = [
  {
    model: Resident,
    as: 'resident',
    attributes: ['id', 'firstName', 'lastName', 'phone', 'photoUrl', 'unitId'],
    include: [
      { model: PropertyUnit, as: 'unit', attributes: ['id', 'unit_number'], required: false },
      {
        model: ResidentFamilyMember,
        as: 'familyMembers',
        attributes: ['id', 'firstName', 'lastName', 'relation'],
        where: { isDeleted: false, isResiding: true },
        required: false,
      },
    ],
  },
  {
    model: User,
    as: 'attendanceMarker',
    attributes: ['id'],
    required: false,
    include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
  },
  {
    model: EventAttendee,
    as: 'attendees',
    required: false,
    include: [
      {
        model: User,
        as: 'marker',
        attributes: ['id'],
        required: false,
        include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
      },
    ],
  },
]

/** GET /attendance/events/:eventId/registrations — the residents registered for the event. */
export async function getEventRegistrations(req: Request, res: Response): Promise<void> {
  try {
    const found = await findMarkableEvent(String(req.params.eventId))
    if (found.error !== undefined) {
      res.status(found.code).json({ success: false, message: found.error })
      return
    }
    const rows = (await EventRegistration.findAll({
      where: { eventId: found.event.id, isDeleted: false, status: { [Op.in]: MARKABLE_STATUSES } },
      include: registrationIncludes,
      order: [['registeredAt', 'ASC']],
    })) as RegistrationRow[]
    res.json({
      success: true,
      data: {
        event: {
          id: found.event.id,
          title: found.event.title,
          startDate: found.event.startDate,
          endDate: found.event.endDate,
          /** Ended: attendance is read-only. */
          ended: hasEnded(found.event),
        },
        registrations: rows.map(serializeRegistration),
      },
    })
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: error instanceof Error ? error.message : 'Failed to load registrations' })
  }
}

/**
 * PATCH /attendance/events/:eventId/registrations/:registrationId  { status }
 * ATTENDED or NO_SHOW marks the registration; CONFIRMED undoes a mark made today.
 */
export async function markEventAttendance(req: Request, res: Response): Promise<void> {
  try {
    const status = String(req.body?.status || '').toUpperCase() as RegistrationStatus
    if (![RegistrationStatus.ATTENDED, RegistrationStatus.NO_SHOW, RegistrationStatus.CONFIRMED].includes(status)) {
      res.status(400).json({ success: false, message: 'status must be ATTENDED, NO_SHOW or CONFIRMED (undo)' })
      return
    }
    const found = await findMarkableEvent(String(req.params.eventId), true)
    if (found.error !== undefined) {
      res.status(found.code).json({ success: false, message: found.error })
      return
    }
    const registration = await EventRegistration.findOne({
      where: { id: String(req.params.registrationId), eventId: found.event.id, isDeleted: false },
    })
    if (!registration || !MARKABLE_STATUSES.includes(registration.status)) {
      res.status(404).json({ success: false, message: 'Registration not found or not confirmed' })
      return
    }
    const today = todayDay()
    if (localDay(found.event.startDate)! > today) {
      res.status(400).json({ success: false, message: 'Attendance can be marked from the day of the event.' })
      return
    }
    if (
      status === RegistrationStatus.CONFIRMED &&
      registration.attendedAt &&
      localDay(registration.updatedAt) !== today
    ) {
      res.status(400).json({ success: false, message: 'Only a mark made today can be undone.' })
      return
    }
    const marker = userId(req)
    await registration.update({
      status,
      attendedAt: status === RegistrationStatus.ATTENDED ? new Date() : null,
      attendanceMarkedBy: status === RegistrationStatus.CONFIRMED ? null : marker,
      updatedBy: marker,
    })
    // Undo or no-show clears the people marked under the reservation.
    if (status !== RegistrationStatus.ATTENDED) {
      await EventAttendee.destroy({ where: { registrationId: registration.id } })
    }
    const updated = (await EventRegistration.findByPk(registration.id, {
      include: registrationIncludes,
    })) as RegistrationRow
    res.json({ success: true, message: 'Attendance updated', data: serializeRegistration(updated) })
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: error instanceof Error ? error.message : 'Failed to mark attendance' })
  }
}

/** Loads a reservation of a markable event for per-person marking, checking the day. */
async function findReservation(req: Request) {
  const found = await findMarkableEvent(String(req.params.eventId), true)
  if (found.error !== undefined) return { error: found.error, code: found.code }
  const registration = (await EventRegistration.findOne({
    where: { id: String(req.params.registrationId), eventId: found.event.id, isDeleted: false },
    include: registrationIncludes,
  })) as RegistrationRow | null
  if (!registration || !MARKABLE_STATUSES.includes(registration.status)) {
    return { error: 'Reservation not found or not confirmed', code: 404 }
  }
  if (localDay(found.event.startDate)! > todayDay()) {
    return { error: 'Attendance can be marked from the day of the event.', code: 400 }
  }
  return { registration }
}

const reloadReservation = async (id: string) =>
  serializeRegistration((await EventRegistration.findByPk(id, { include: registrationIncludes })) as RegistrationRow)

/**
 * PUT /attendance/events/:eventId/registrations/:registrationId/people  { familyMemberId? }
 * Marks one person of the reservation (the resident, or a residing family member) as came.
 * No more people than the seats reserved can be marked.
 */
export async function markReservationPerson(req: Request, res: Response): Promise<void> {
  try {
    const found = await findReservation(req)
    if (!found.registration) {
      res.status(found.code).json({ success: false, message: found.error })
      return
    }
    const registration = found.registration
    const familyMemberId = req.body?.familyMemberId ? String(req.body.familyMemberId) : null
    const person = reservationPeople(registration).find((p) => p.familyMemberId === familyMemberId)
    if (!person) {
      res.status(400).json({ success: false, message: 'This family member is not residing with the resident' })
      return
    }
    if (person.attended) {
      res.json({
        success: true,
        message: `${person.name} is already marked`,
        data: serializeRegistration(registration),
      })
      return
    }
    const seats = Number(registration.seatCount) || 1
    if ((registration.attendees ?? []).length >= seats) {
      res.status(400).json({
        success: false,
        message: `Only ${seats} seat(s) were reserved: all are already marked.`,
      })
      return
    }
    const marker = userId(req)
    const now = new Date()
    await EventAttendee.create({
      registrationId: registration.id,
      eventId: registration.eventId,
      residentId: registration.residentId,
      familyMemberId,
      markedBy: marker,
      markedAt: now,
      createdBy: marker,
      updatedBy: marker,
    })
    await registration.update({
      status: RegistrationStatus.ATTENDED,
      attendedAt: registration.attendedAt ?? now,
      attendanceMarkedBy: marker,
      updatedBy: marker,
    })
    res.json({
      success: true,
      message: `${person.name} marked as came`,
      data: await reloadReservation(registration.id),
    })
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: error instanceof Error ? error.message : 'Failed to mark attendance' })
  }
}

/**
 * DELETE /attendance/events/:eventId/registrations/:registrationId/people?familyMemberId=
 * Undoes one person's mark made today. When nobody is left marked, the reservation is Confirmed again.
 */
export async function undoReservationPerson(req: Request, res: Response): Promise<void> {
  try {
    const found = await findReservation(req)
    if (!found.registration) {
      res.status(found.code).json({ success: false, message: found.error })
      return
    }
    const registration = found.registration
    const familyMemberId = req.query.familyMemberId ? String(req.query.familyMemberId) : null
    const attendee = (registration.attendees ?? []).find((a) => (a.familyMemberId ?? null) === familyMemberId)
    if (!attendee) {
      res.status(404).json({ success: false, message: 'This person is not marked' })
      return
    }
    if (localDay(attendee.markedAt) !== todayDay()) {
      res.status(400).json({ success: false, message: 'Only a mark made today can be undone.' })
      return
    }
    await attendee.destroy()
    if ((registration.attendees ?? []).length <= 1) {
      await registration.update({
        status: RegistrationStatus.CONFIRMED,
        attendedAt: null,
        attendanceMarkedBy: null,
        updatedBy: userId(req),
      })
    }
    res.json({ success: true, message: 'Mark undone', data: await reloadReservation(registration.id) })
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: error instanceof Error ? error.message : 'Failed to undo attendance' })
  }
}

type MarkedRow = EventRegistration & { attendanceMarker?: User & { profile?: UserDetail | null } }
type ResidentWithFamily = Resident & {
  unit?: PropertyUnit | null
  familyMembers?: ResidentFamilyMember[]
}

const residingFamilyInclude = {
  model: ResidentFamilyMember,
  as: 'familyMembers',
  attributes: ['id', 'firstName', 'lastName', 'relation'],
  where: { isDeleted: false, isResiding: true },
  required: false,
}

/** Key of one person at an event: the resident, or one of their family members. */
const personKey = (residentId: string, familyMemberId?: string | null) => `${residentId}:${familyMemberId ?? ''}`

/**
 * GET /attendance/events/:eventId/walk-ins — for an event without reservations: every residing
 * household at the property, each person (resident and residing family members) by name, with
 * their attendance if already marked.
 */
export async function getEventWalkIns(req: Request, res: Response): Promise<void> {
  try {
    const found = await findMarkableEvent(String(req.params.eventId))
    if (found.error !== undefined) {
      res.status(found.code).json({ success: false, message: found.error })
      return
    }
    if (found.event.allowReservation) {
      res.status(400).json({ success: false, message: 'This event takes reservations: mark its registered residents.' })
      return
    }
    const [residents, marked] = await Promise.all([
      Resident.findAll({
        where: { locId: found.event.locationId, isResiding: true, isDeleted: false },
        attributes: ['id', 'firstName', 'lastName', 'phone', 'photoUrl', 'unitId'],
        include: [
          { model: PropertyUnit, as: 'unit', attributes: ['id', 'unit_number'], required: false },
          residingFamilyInclude,
        ],
      }) as Promise<ResidentWithFamily[]>,
      EventRegistration.findAll({
        where: { eventId: found.event.id, isDeleted: false, status: RegistrationStatus.ATTENDED },
        include: registrationIncludes,
      }) as Promise<MarkedRow[]>,
    ])
    const byPerson = new Map(marked.map((r) => [personKey(r.residentId, r.familyMemberId), r]))
    const person = (residentId: string, familyMemberId: string | null, name: string, tag: string) => {
      const reg = byPerson.get(personKey(residentId, familyMemberId))
      return {
        familyMemberId,
        name,
        tag,
        status: reg ? RegistrationStatus.ATTENDED : 'NOT_MARKED',
        attendedAt: reg?.attendedAt ?? null,
        markedBy: reg?.attendanceMarker ? fullName(reg.attendanceMarker.profile) || 'Staff' : null,
      }
    }
    const households = residents
      .map((r) => ({
        residentId: r.id,
        unitNumber: r.unit?.unit_number ?? null,
        phone: r.phone ?? null,
        people: [
          person(r.id, null, fullName(r), 'Resident'),
          ...(r.familyMembers ?? []).map((f) => person(r.id, f.id, fullName(f), f.relation || 'Family member')),
        ],
      }))
      .sort((a, b) =>
        String(a.unitNumber ?? '').localeCompare(String(b.unitNumber ?? ''), undefined, { numeric: true }),
      )
    res.json({
      success: true,
      data: {
        event: {
          id: found.event.id,
          title: found.event.title,
          startDate: found.event.startDate,
          endDate: found.event.endDate,
          /** Ended: attendance is read-only. */
          ended: hasEnded(found.event),
          entryFee: Number(found.event.entryFee) || 0,
        },
        households,
      },
    })
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: error instanceof Error ? error.message : 'Failed to load residents' })
  }
}

/** Resolves the resident (and family member) being marked; both must be residing at the event's property. */
async function findPerson(event: Event, residentId: string, familyMemberId: string | null) {
  const resident = (await Resident.findOne({
    where: { id: residentId, locId: event.locationId, isResiding: true, isDeleted: false },
    attributes: ['id', 'firstName', 'lastName'],
    include: [residingFamilyInclude],
  })) as ResidentWithFamily | null
  if (!resident) return { error: 'Residing resident not found at this property' }
  const member = familyMemberId ? resident.familyMembers?.find((f) => f.id === familyMemberId) : null
  if (familyMemberId && !member) return { error: 'This family member is not residing with the resident' }
  return { resident, name: member ? fullName(member) : fullName(resident) }
}

/**
 * PUT /attendance/events/:eventId/walk-ins/:residentId  { familyMemberId? }
 * Marks one person (the resident, or one of their residing family members) as attended at an
 * event without reservations. Saved as an Attended registration for that person, so a paid
 * event's entry fee is billed to the flat for them.
 */
export async function markWalkInAttendance(req: Request, res: Response): Promise<void> {
  try {
    const found = await findMarkableEvent(String(req.params.eventId), true)
    if (found.error !== undefined) {
      res.status(found.code).json({ success: false, message: found.error })
      return
    }
    const event = found.event
    if (event.allowReservation) {
      res.status(400).json({ success: false, message: 'This event takes reservations: mark its registered residents.' })
      return
    }
    if (localDay(event.startDate)! > todayDay()) {
      res.status(400).json({ success: false, message: 'Attendance can be marked from the day of the event.' })
      return
    }
    const familyMemberId = req.body?.familyMemberId ? String(req.body.familyMemberId) : null
    const who = await findPerson(event, String(req.params.residentId), familyMemberId)
    if ('error' in who) {
      res.status(404).json({ success: false, message: who.error })
      return
    }
    const marker = userId(req)
    // An undone mark is soft-deleted: reuse that row, as the person's key is unique per day.
    const existing = await EventRegistration.findOne({
      where: { eventId: event.id, residentId: who.resident.id, familyMemberId, registrationDate: todayDay() },
    })
    const fields = {
      status: RegistrationStatus.ATTENDED,
      seatCount: 1,
      isDeleted: false,
      attendedAt: existing && !existing.isDeleted ? (existing.attendedAt ?? new Date()) : new Date(),
      attendanceMarkedBy: marker,
      updatedBy: marker,
    }
    const registration = existing
      ? await existing.update(fields)
      : await EventRegistration.create({
          ...fields,
          eventId: event.id,
          residentId: who.resident.id,
          familyMemberId,
          registeredAt: new Date(),
          registrationDate: todayDay(),
          locationId: event.locationId,
          notes: 'Walk-in (marked by attendance staff)',
          createdBy: marker,
        } as never)
    res.json({ success: true, message: `${who.name} marked attended`, data: { id: registration.id } })
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: error instanceof Error ? error.message : 'Failed to mark attendance' })
  }
}

/** DELETE /attendance/events/:eventId/walk-ins/:residentId?familyMemberId= — undo a mark made today. */
export async function undoWalkInAttendance(req: Request, res: Response): Promise<void> {
  try {
    const found = await findMarkableEvent(String(req.params.eventId), true)
    if (found.error !== undefined) {
      res.status(found.code).json({ success: false, message: found.error })
      return
    }
    const familyMemberId = req.query.familyMemberId ? String(req.query.familyMemberId) : null
    const registration = await EventRegistration.findOne({
      where: {
        eventId: found.event.id,
        residentId: String(req.params.residentId),
        familyMemberId,
        isDeleted: false,
      },
    })
    if (!registration || found.event.allowReservation) {
      res.status(404).json({ success: false, message: 'No walk-in attendance to undo' })
      return
    }
    if (localDay(registration.attendedAt ?? registration.updatedAt) !== todayDay()) {
      res.status(400).json({ success: false, message: 'Only a mark made today can be undone.' })
      return
    }
    await registration.update({ isDeleted: true, updatedBy: userId(req) })
    res.json({ success: true, message: 'Attendance removed' })
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: error instanceof Error ? error.message : 'Failed to undo attendance' })
  }
}
