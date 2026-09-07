import type { Response } from 'express'
import { Op, fn, col } from 'sequelize'
import { Event, EventRegistration, EventVenue, Resident } from '../../../models/index.js'
import { RegistrationStatus } from '../../../enums/event.enum.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { resolveResidentRequestEventPoster } from '../../../utils/event.util.js'

type EventWithVenue = Event & { venue?: EventVenue | null }

const ACTIVE_REG_STATUSES = [RegistrationStatus.PENDING, RegistrationStatus.CONFIRMED, RegistrationStatus.ATTENDED]

function toDateOnly(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString().split('T')[0]!
}

function startOfTodayUtc(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function endOfTodayUtc(): Date {
  const start = startOfTodayUtc()
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)
}

async function resolveResidentContext(req: AuthenticatedRequest): Promise<{
  residentId: string
  locationId: string
} | null> {
  const residentId = req.user?.residentId || req.user?.id
  if (!residentId) return null

  const locationId =
    (req.query.locationId as string) ||
    (req.query.locId as string) ||
    req.user?.defaultLocationId ||
    req.locationId ||
    null

  if (locationId) {
    return { residentId, locationId: String(locationId) }
  }

  const resident = await Resident.findByPk(residentId)
  if (!resident?.locId) return null
  return { residentId, locationId: resident.locId }
}

async function getActiveSeatSum(eventId: string, locationId: string): Promise<number> {
  const result = (await EventRegistration.findOne({
    attributes: [[fn('COALESCE', fn('SUM', col('seatCount')), 0), 'totalSeats']],
    where: {
      eventId,
      locationId,
      isDeleted: false,
      status: { [Op.in]: ACTIVE_REG_STATUSES },
    },
    raw: true,
  })) as { totalSeats?: string | number } | null

  return Number(result?.totalSeats ?? 0)
}

function serializeEventListItem(event: EventWithVenue) {
  const venue = event.venue
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    startDate: event.startDate,
    endDate: event.endDate,
    poster: resolveResidentRequestEventPoster(event, venue),
    eventType: event.eventType,
    allowReservation: event.allowReservation,
    venue: venue ? { id: venue.id, name: venue.name, coverPhoto: venue.coverPhoto || null } : null,
  }
}

/**
 * GET /api/v1/mobile/l1/events?filter=upcoming|today
 */
export async function getResidentEvents(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ctx = await resolveResidentContext(req)
    if (!ctx) {
      res.status(401).json({ success: false, message: 'Authentication required or location not found' })
      return
    }

    const filter = String(req.query.filter || 'upcoming').toLowerCase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      locationId: ctx.locationId,
      isDeleted: false,
      isActive: true,
    }

    if (filter === 'today') {
      where.startDate = {
        [Op.between]: [startOfTodayUtc(), endOfTodayUtc()],
      }
    } else {
      // upcoming: future calendar days only (exclude today — shown under Today's Events)
      where.startDate = { [Op.gt]: endOfTodayUtc() }
    }

    const events = await Event.findAll({
      where,
      include: [
        {
          model: EventVenue,
          as: 'venue',
          attributes: ['id', 'name', 'coverPhoto'],
          required: false,
        },
      ],
      order: [['startDate', 'ASC']],
    })

    res.status(200).json({
      success: true,
      data: (events as EventWithVenue[]).map(serializeEventListItem),
    })
  } catch (err) {
    console.error('Error fetching L1 resident events:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch events' })
  }
}

/**
 * GET /api/v1/mobile/l1/events/:id
 */
export async function getResidentEventById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ctx = await resolveResidentContext(req)
    if (!ctx) {
      res.status(401).json({ success: false, message: 'Authentication required or location not found' })
      return
    }

    const { id } = req.params
    const event = (await Event.findOne({
      where: {
        id,
        locationId: ctx.locationId,
        isDeleted: false,
        isActive: true,
      },
      include: [
        {
          model: EventVenue,
          as: 'venue',
          attributes: ['id', 'name', 'occupancy', 'coverPhoto'],
          required: false,
        },
      ],
    })) as EventWithVenue | null

    if (!event) {
      res.status(404).json({ success: false, message: 'Event not found' })
      return
    }

    const venue = event.venue
    const totalCapacity = event.maxCapacity ?? venue?.occupancy ?? 0
    const activeSeats = await getActiveSeatSum(event.id, ctx.locationId)
    const availableSpots = totalCapacity > 0 ? Math.max(0, totalCapacity - activeSeats) : null

    const registrationDate = toDateOnly(event.startDate)
    const myRegistration = await EventRegistration.findOne({
      where: {
        eventId: event.id,
        residentId: ctx.residentId,
        registrationDate,
        isDeleted: false,
        status: { [Op.ne]: RegistrationStatus.CANCELLED },
      },
    })

    res.status(200).json({
      success: true,
      data: {
        id: event.id,
        title: event.title,
        description: event.description,
        startDate: event.startDate,
        endDate: event.endDate,
        poster: resolveResidentRequestEventPoster(event, venue),
        eventType: event.eventType,
        allowReservation: event.allowReservation,
        reservationPerFlat: event.reservationPerFlat,
        occupancy: event.occupancy,
        maxCapacity: event.maxCapacity,
        entryFee: event.entryFee,
        venue: venue
          ? {
              id: venue.id,
              name: venue.name,
              occupancy: venue.occupancy,
              coverPhoto: venue.coverPhoto,
            }
          : null,
        capacity: {
          totalCapacity,
          activeSeats,
          availableSpots,
          isFullyBooked: availableSpots !== null && availableSpots <= 0,
        },
        myRegistration: myRegistration
          ? {
              id: myRegistration.id,
              status: myRegistration.status,
              seatCount: myRegistration.seatCount,
              registeredAt: myRegistration.registeredAt,
              registrationDate: myRegistration.registrationDate,
            }
          : null,
      },
    })
  } catch (err) {
    console.error('Error fetching L1 resident event detail:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch event details' })
  }
}

/**
 * POST /api/v1/mobile/l1/events/:id/reserve
 * Body: { seatCount: number }
 */
export async function reserveEventSeats(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ctx = await resolveResidentContext(req)
    if (!ctx) {
      res.status(401).json({ success: false, message: 'Authentication required or location not found' })
      return
    }

    const { id } = req.params
    const seatCount = Number(req.body?.seatCount ?? 1)

    if (!Number.isInteger(seatCount) || seatCount < 1) {
      res.status(400).json({ success: false, message: 'seatCount must be a positive integer' })
      return
    }

    const event = (await Event.findOne({
      where: {
        id,
        locationId: ctx.locationId,
        isDeleted: false,
        isActive: true,
      },
      include: [
        {
          model: EventVenue,
          as: 'venue',
          attributes: ['id', 'name', 'occupancy'],
          required: false,
        },
      ],
    })) as EventWithVenue | null

    if (!event) {
      res.status(404).json({ success: false, message: 'Event not found' })
      return
    }

    if (!event.allowReservation) {
      res.status(400).json({ success: false, message: 'Seat reservation is not enabled for this event' })
      return
    }

    const maxPerFlat = event.reservationPerFlat && event.reservationPerFlat > 0 ? event.reservationPerFlat : 1
    if (seatCount > maxPerFlat) {
      res.status(400).json({
        success: false,
        message: `You can reserve at most ${maxPerFlat} seat(s) per flat for this event`,
      })
      return
    }

    const venue = event.venue
    const totalCapacity = event.maxCapacity ?? venue?.occupancy ?? 0
    const activeSeats = await getActiveSeatSum(event.id, ctx.locationId)
    const availableSpots = totalCapacity > 0 ? Math.max(0, totalCapacity - activeSeats) : null

    if (availableSpots !== null && seatCount > availableSpots) {
      res.status(400).json({
        success: false,
        message: availableSpots === 0 ? 'This event is fully booked' : `Only ${availableSpots} seat(s) available`,
      })
      return
    }

    const registrationDate = toDateOnly(event.startDate)
    const existing = await EventRegistration.findOne({
      where: {
        eventId: event.id,
        residentId: ctx.residentId,
        registrationDate,
        isDeleted: false,
        status: { [Op.ne]: RegistrationStatus.CANCELLED },
      },
    })

    if (existing) {
      res.status(409).json({
        success: false,
        message: 'You have already reserved seats for this event',
        data: {
          id: existing.id,
          status: existing.status,
          seatCount: existing.seatCount,
        },
      })
      return
    }

    // Soft-deleted or cancelled prior row on same unique key: reuse/update if present
    const prior = await EventRegistration.findOne({
      where: {
        eventId: event.id,
        residentId: ctx.residentId,
        registrationDate,
      },
    })

    let registration: EventRegistration
    if (prior) {
      await prior.update({
        status: RegistrationStatus.CONFIRMED,
        seatCount,
        registeredAt: new Date(),
        cancelledAt: null,
        cancellationReason: null,
        isActive: true,
        isDeleted: false,
        locationId: ctx.locationId,
        updatedBy: ctx.residentId,
      })
      registration = prior
    } else {
      registration = await EventRegistration.create({
        eventId: event.id,
        residentId: ctx.residentId,
        status: RegistrationStatus.CONFIRMED,
        registeredAt: new Date(),
        registrationDate,
        seatCount,
        locationId: ctx.locationId,
        isActive: true,
        isDeleted: false,
        createdBy: ctx.residentId,
        updatedBy: ctx.residentId,
      })
    }

    res.status(201).json({
      success: true,
      message: `Successfully reserved ${seatCount} seat(s)`,
      data: {
        id: registration.id,
        eventId: event.id,
        status: registration.status,
        seatCount: registration.seatCount,
        registeredAt: registration.registeredAt,
        registrationDate: registration.registrationDate,
      },
    })
  } catch (err) {
    console.error('Error reserving L1 event seats:', err)
    // Unique constraint race
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((err as any)?.name === 'SequelizeUniqueConstraintError') {
      res.status(409).json({ success: false, message: 'You have already reserved seats for this event' })
      return
    }
    res.status(500).json({ success: false, message: 'Failed to reserve seats' })
  }
}
