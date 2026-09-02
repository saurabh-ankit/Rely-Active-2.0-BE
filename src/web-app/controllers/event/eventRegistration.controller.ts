import type { Response } from 'express'
import { Op } from 'sequelize'
import sequelize from '../../../config/db/index.js'
import { RegistrationStatus } from '../../../enums/eventRegistration/index.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { Event, EventRegistration, Resident, Venue } from '../../../models/index.js'
import type { EventRegistrationAttributes } from '../../../models/eventRegistration.model.js'
import { errorResponse, successResponse } from '../../../utils/response/index.js'

interface IncludedResident {
  id: string
  firstName: string
  lastName?: string | null
  username?: string | null
  photoUrl?: string | null
  email?: string | null
  phone?: string | null
  dob?: string | null
  gender?: string | null
}

interface IncludedEvent {
  id: string
  title: string
  eventType: string
  startDate: Date
  endDate: Date
  poster?: string | null
}

type EventRegistrationJson = EventRegistrationAttributes & {
  resident?: IncludedResident | null
  event?: IncludedEvent | null
}

export const getEventRegistrations = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { locationId, eventId } = req.params
    const { status, search, registrationDate, page = 1, limit = 20 } = req.query

    const event = await Event.findOne({
      where: { id: eventId, locationId, isDeleted: false },
    })

    if (!event) {
      return res.status(404).json(errorResponse('Event not found'))
    }

    const offset = (parseInt(String(page)) - 1) * parseInt(String(limit))
    const whereClause: Record<string, unknown> = {
      eventId,
      locationId,
      isDeleted: false,
    }

    if (status) whereClause.status = status

    if (registrationDate) {
      const date = new Date(String(registrationDate))
      if (!isNaN(date.getTime())) {
        date.setHours(0, 0, 0, 0)
        const nextDay = new Date(date)
        nextDay.setDate(nextDay.getDate() + 1)
        whereClause.registrationDate = { [Op.gte]: date, [Op.lt]: nextDay }
      }
    }

    const { count, rows } = await EventRegistration.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Resident,
          as: 'resident',
          attributes: ['id', 'firstName', 'lastName', 'username', 'photoUrl', 'email', 'phone', 'dob', 'gender'],
          where: search
            ? {
                [Op.or]: [
                  { firstName: { [Op.like]: `%${search}%` } },
                  { lastName: { [Op.like]: `%${search}%` } },
                  { username: { [Op.like]: `%${search}%` } },
                  { email: { [Op.like]: `%${search}%` } },
                  { phone: { [Op.like]: `%${search}%` } },
                ],
                isDeleted: false,
              }
            : { isDeleted: false },
          required: true,
        },
      ],
      order: [['registeredAt', 'DESC']],
      limit: parseInt(String(limit)),
      offset,
    })

    const formattedRegistrations = rows.map((reg) => {
      const regData = reg.toJSON() as EventRegistrationJson
      return {
        id: regData.id,
        eventId: regData.eventId,
        residentId: regData.residentId,
        patientId: regData.residentId,
        status: regData.status,
        registeredAt: regData.registeredAt,
        registrationDate: regData.registrationDate,
        cancelledAt: regData.cancelledAt,
        cancellationReason: regData.cancellationReason,
        attendedAt: regData.attendedAt,
        notes: regData.notes,
        resident: regData.resident
          ? {
              id: regData.resident.id,
              firstName: regData.resident.firstName,
              lastName: regData.resident.lastName,
              fullName: `${regData.resident.firstName} ${regData.resident.lastName || ''}`.trim(),
              username: regData.resident.username,
              profilePhoto: regData.resident.photoUrl,
              contact_email: regData.resident.email,
              contact_phone: regData.resident.phone,
              dob: regData.resident.dob,
              gender: regData.resident.gender,
            }
          : null,
        patient: regData.resident
          ? {
              id: regData.resident.id,
              firstName: regData.resident.firstName,
              lastName: regData.resident.lastName,
              fullName: `${regData.resident.firstName} ${regData.resident.lastName || ''}`.trim(),
              username: regData.resident.username,
              profilePhoto: regData.resident.photoUrl,
              contact_email: regData.resident.email,
              contact_phone: regData.resident.phone,
              dob: regData.resident.dob,
              gender: regData.resident.gender,
            }
          : null,
        event: {
          id: event.id,
          title: event.title,
          eventType: event.eventType,
          description: event.description,
          startDate: event.startDate,
          endDate: event.endDate,
          poster: event.poster,
          allowReservation: event.allowReservation,
        },
      }
    })

    return res.status(200).json(
      successResponse('Event registrations retrieved successfully', {
        registrations: formattedRegistrations,
        pagination: {
          currentPage: parseInt(String(page)),
          totalPages: Math.ceil(count / parseInt(String(limit))),
          totalCount: count,
          limit: parseInt(String(limit)),
          hasNextPage: offset + parseInt(String(limit)) < count,
          hasPrevPage: parseInt(String(page)) > 1,
          nextPage: offset + parseInt(String(limit)) < count ? parseInt(String(page)) + 1 : null,
          prevPage: parseInt(String(page)) > 1 ? parseInt(String(page)) - 1 : null,
        },
      }),
    )
  } catch (err) {
    console.error('Get Event Registrations Error:', err)
    return res.status(500).json(errorResponse('Failed to fetch event registrations'))
  }
}

export const getEventCapacity = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { locationId, eventId } = req.params

    const event = await Event.findOne({
      where: { id: eventId, locationId, isDeleted: false },
      include: [{ model: Venue, as: 'venue', attributes: ['id', 'name', 'occupancy'], required: false }],
    })

    if (!event) {
      return res.status(404).json(errorResponse('Event not found'))
    }

    let venue = (event as Event & { venue?: Venue }).venue
    if (!venue && event.venueId) {
      venue =
        (await Venue.findOne({
          where: { id: event.venueId, locationId, isDeleted: false },
          attributes: ['id', 'name', 'occupancy'],
        })) ||
        (await Venue.findOne({
          where: { id: event.venueId, isDeleted: false },
          attributes: ['id', 'name', 'occupancy'],
        })) ||
        undefined
    }

    if (!venue) {
      return res.status(404).json(errorResponse('Venue not found for this event'))
    }

    const baseWhere = { eventId, locationId, isDeleted: false }

    const totalRegistrations = await EventRegistration.count({ where: baseWhere })
    const confirmedRegistrations = await EventRegistration.count({
      where: { ...baseWhere, status: RegistrationStatus.CONFIRMED },
    })
    const pendingRegistrations = await EventRegistration.count({
      where: { ...baseWhere, status: RegistrationStatus.PENDING },
    })
    const cancelledRegistrations = await EventRegistration.count({
      where: { ...baseWhere, status: RegistrationStatus.CANCELLED },
    })
    const attendedRegistrations = await EventRegistration.count({
      where: { ...baseWhere, status: RegistrationStatus.ATTENDED },
    })
    const noShowRegistrations = await EventRegistration.count({
      where: { ...baseWhere, status: RegistrationStatus.NO_SHOW },
    })

    const totalCapacity = event.maxCapacity ?? venue.occupancy ?? 0
    const activeRegistrations = confirmedRegistrations + pendingRegistrations
    const availableSpots = totalCapacity > 0 ? totalCapacity - activeRegistrations : null
    const utilizationPercentage = totalCapacity > 0 ? (activeRegistrations / totalCapacity) * 100 : 0

    return res.status(200).json(
      successResponse('Event capacity retrieved successfully', {
        eventId: event.id,
        eventTitle: event.title,
        venueId: venue.id,
        venueName: venue.name,
        venueCapacity: venue.occupancy || 0,
        maxCapacity: event.maxCapacity,
        reservationPerFlat: event.reservationPerFlat,
        totalCapacity,
        totalRegistrations,
        confirmedRegistrations,
        pendingRegistrations,
        cancelledRegistrations,
        attendedRegistrations,
        noShowRegistrations,
        activeRegistrations,
        availableSpots,
        utilizationPercentage: Math.round(utilizationPercentage * 100) / 100,
        isFullyBooked: availableSpots !== null && availableSpots <= 0,
      }),
    )
  } catch (err) {
    console.error('Get Event Capacity Error:', err)
    return res.status(500).json(errorResponse('Failed to fetch event capacity'))
  }
}

export const updateRegistrationStatus = async (req: AuthenticatedRequest, res: Response) => {
  const transaction = await sequelize.transaction()
  try {
    const { locationId, eventId, registrationId } = req.params
    const { status, notes } = req.body
    const updatedBy = req.user?.id

    if (!updatedBy) {
      await transaction.rollback()
      return res.status(401).json(errorResponse('User not authenticated'))
    }

    const validStatuses = [RegistrationStatus.ATTENDED, RegistrationStatus.NO_SHOW, RegistrationStatus.CANCELLED]
    if (!status || !validStatuses.includes(status)) {
      await transaction.rollback()
      return res.status(400).json(errorResponse(`Invalid status. Must be one of: ${validStatuses.join(', ')}`))
    }

    const event = await Event.findOne({
      where: { id: eventId, locationId, isDeleted: false },
      transaction,
    })

    if (!event) {
      await transaction.rollback()
      return res.status(404).json(errorResponse('Event not found'))
    }

    const registration = await EventRegistration.findOne({
      where: { id: registrationId, eventId, locationId, isDeleted: false },
      include: [
        {
          model: Resident,
          as: 'resident',
          attributes: ['id', 'firstName', 'lastName', 'username', 'email', 'phone', 'photoUrl'],
        },
        { model: Event, as: 'event', attributes: ['id', 'title', 'startDate', 'endDate'] },
      ],
      transaction,
    })

    if (!registration) {
      await transaction.rollback()
      return res.status(404).json(errorResponse('Registration not found'))
    }

    const previousStatus = registration.status
    const updateData: Record<string, unknown> = { status, updatedBy }

    if (status === RegistrationStatus.ATTENDED) {
      updateData.attendedAt = new Date()
      updateData.cancelledAt = null
      updateData.cancellationReason = null
    } else if (status === RegistrationStatus.NO_SHOW) {
      updateData.attendedAt = null
    } else if (status === RegistrationStatus.CANCELLED) {
      updateData.cancelledAt = new Date()
      updateData.cancellationReason = notes || 'Cancelled by admin'
      updateData.attendedAt = null
    }

    if (notes !== undefined) updateData.notes = notes || null

    await EventRegistration.update(updateData, {
      where: { id: registration.id },
      transaction,
    })

    await transaction.commit()

    const updatedRegistration = await EventRegistration.findByPk(registration.id, {
      include: [
        {
          model: Resident,
          as: 'resident',
          attributes: ['id', 'firstName', 'lastName', 'username', 'photoUrl', 'email', 'phone'],
        },
        { model: Event, as: 'event', attributes: ['id', 'title', 'eventType', 'startDate', 'endDate', 'poster'] },
      ],
    })

    if (!updatedRegistration) {
      return res.status(404).json(errorResponse('Registration not found after update'))
    }

    const regData = updatedRegistration.toJSON() as EventRegistrationJson

    return res.status(200).json(
      successResponse(`Registration status updated to ${status} successfully`, {
        registration: {
          id: regData.id,
          eventId: regData.eventId,
          residentId: regData.residentId,
          patientId: regData.residentId,
          status: regData.status,
          previousStatus,
          registrationDate: regData.registrationDate,
          registeredAt: regData.registeredAt,
          attendedAt: regData.attendedAt,
          cancelledAt: regData.cancelledAt,
          cancellationReason: regData.cancellationReason,
          notes: regData.notes,
          resident: regData.resident
            ? {
                id: regData.resident.id,
                firstName: regData.resident.firstName,
                lastName: regData.resident.lastName,
                fullName: `${regData.resident.firstName || ''} ${regData.resident.lastName || ''}`.trim(),
                username: regData.resident.username,
                profilePhoto: regData.resident.photoUrl,
                contact_email: regData.resident.email,
                contact_phone: regData.resident.phone,
              }
            : null,
          patient: regData.resident
            ? {
                id: regData.resident.id,
                firstName: regData.resident.firstName,
                lastName: regData.resident.lastName,
                fullName: `${regData.resident.firstName || ''} ${regData.resident.lastName || ''}`.trim(),
                username: regData.resident.username,
                profilePhoto: regData.resident.photoUrl,
                contact_email: regData.resident.email,
                contact_phone: regData.resident.phone,
              }
            : null,
          event: regData.event
            ? {
                id: regData.event.id,
                title: regData.event.title,
                eventType: regData.event.eventType,
                startDate: regData.event.startDate,
                endDate: regData.event.endDate,
                poster: regData.event.poster,
              }
            : null,
        },
      }),
    )
  } catch (err) {
    await transaction.rollback()
    console.error('Update Registration Status Error:', err)
    return res.status(500).json(errorResponse('Failed to update registration status'))
  }
}
