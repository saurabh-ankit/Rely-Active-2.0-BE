import type { Response } from 'express'
import { Op, Sequelize } from 'sequelize'
import sequelize from '../../../config/db/index.js'
import { EventType, FrequencyType } from '../../../enums/event/index.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { Event, Property, Venue } from '../../../models/index.js'
import type { AddOnService } from '../../../models/venue.model.js'
import {
  generateRecurringEventDates,
  getNoOccurrencesErrorMessage,
  getWeeklyRecurrenceDays,
  type RecurrenceConfig,
} from '../../../utils/eventRecurrence.js'
import { parseJsonBodyField } from '../../../utils/parseBodyField.js'
import { getUploadedFilePath } from '../../../utils/uploadHelper.js'
import { errorResponse, successResponse } from '../../../utils/response/index.js'
import { normalizeServiceQuantity, parsePositiveInt } from '../../../utils/serviceQuantity.js'

const getServiceKey = (service: AddOnService): string => service.globalServiceId || service.name

const resolveSelectedServices = (
  selected: AddOnService[] | undefined,
  venueAddOns: AddOnService[] | null | undefined,
): { ok: true; services: AddOnService[] | null } | { ok: false; error: string } => {
  if (selected === undefined) {
    return { ok: true, services: null }
  }
  if (!Array.isArray(selected)) {
    return { ok: false, error: 'selectedServices must be an array' }
  }
  if (selected.length === 0) {
    return { ok: true, services: [] }
  }

  const venueServices = Array.isArray(venueAddOns) ? venueAddOns : []
  if (venueServices.length === 0) {
    return { ok: false, error: 'Selected venue has no add-on services' }
  }

  const venueByKey = new Map(venueServices.map((s) => [getServiceKey(s), s]))
  const resolved: AddOnService[] = []

  for (const item of selected) {
    if (!item || typeof item.name !== 'string' || !item.name.trim()) {
      return { ok: false, error: 'Each selected service must have a name' }
    }
    const key = getServiceKey(item)
    const match = venueByKey.get(key)
    if (!match) {
      return { ok: false, error: `Service "${item.name}" is not available for the selected venue` }
    }

    const quantity = parsePositiveInt(item.quantity)
    if (quantity === null) {
      return { ok: false, error: `Quantity must be at least 1 for service "${item.name}"` }
    }

    const venueQuantity = normalizeServiceQuantity(match.quantity)
    if (quantity > venueQuantity) {
      return {
        ok: false,
        error: `Quantity for "${item.name}" exceeds venue allocation (${venueQuantity} max)`,
      }
    }

    resolved.push({ ...match, quantity })
  }

  return { ok: true, services: resolved }
}

const parseOptionalInt = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null
  const parsed = parseInt(String(value), 10)
  return isNaN(parsed) ? null : parsed
}

const parseRecurrenceDaysOfWeek = (raw: unknown): number[] | undefined => {
  if (raw === undefined || raw === null || raw === '') return undefined
  if (Array.isArray(raw)) {
    const days = raw.map((d) => parseInt(String(d), 10)).filter((d) => !isNaN(d) && d >= 0 && d <= 6)
    return days.length > 0 ? [...new Set(days)].sort((a, b) => a - b) : undefined
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return undefined
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        const days = parsed.map((d) => parseInt(String(d), 10)).filter((d) => !isNaN(d) && d >= 0 && d <= 6)
        return days.length > 0 ? [...new Set(days)].sort((a, b) => a - b) : undefined
      }
    } catch {
      const days = trimmed
        .split(',')
        .map((d) => parseInt(d.trim(), 10))
        .filter((d) => !isNaN(d) && d >= 0 && d <= 6)
      return days.length > 0 ? [...new Set(days)].sort((a, b) => a - b) : undefined
    }
  }
  return undefined
}

const parseRecurrenceConfig = (body: Record<string, unknown>): RecurrenceConfig => {
  const config: RecurrenceConfig = {}
  const daysOfWeek = parseRecurrenceDaysOfWeek(body.recurrenceDaysOfWeek)
  if (daysOfWeek) {
    config.recurrenceDaysOfWeek = daysOfWeek
  } else if (body.recurrenceDayOfWeek !== undefined && body.recurrenceDayOfWeek !== '') {
    const day = parseInt(String(body.recurrenceDayOfWeek), 10)
    if (!isNaN(day) && day >= 0 && day <= 6) {
      config.recurrenceDayOfWeek = day
      config.recurrenceDaysOfWeek = [day]
    }
  }
  if (body.recurrenceDayOfMonth !== undefined && body.recurrenceDayOfMonth !== '') {
    config.recurrenceDayOfMonth = parseInt(String(body.recurrenceDayOfMonth), 10)
  }
  if (body.recurrenceMonth !== undefined && body.recurrenceMonth !== '') {
    config.recurrenceMonth = parseInt(String(body.recurrenceMonth), 10)
  }
  return config
}

const resolveStoredWeeklyRecurrence = (
  config: RecurrenceConfig,
  existing?: { recurrenceDayOfWeek?: number | null; recurrenceDaysOfWeek?: number[] | null },
): { recurrenceDaysOfWeek: number[] | null; recurrenceDayOfWeek: number | null } => {
  const fromConfig = getWeeklyRecurrenceDays(config)
  if (fromConfig.length > 0) {
    return {
      recurrenceDaysOfWeek: fromConfig,
      recurrenceDayOfWeek: fromConfig[0] ?? null,
    }
  }
  if (existing?.recurrenceDaysOfWeek?.length) {
    const days = getWeeklyRecurrenceDays({ recurrenceDaysOfWeek: existing.recurrenceDaysOfWeek })
    return {
      recurrenceDaysOfWeek: days.length > 0 ? days : null,
      recurrenceDayOfWeek: days[0] ?? null,
    }
  }
  if (existing?.recurrenceDayOfWeek != null) {
    return {
      recurrenceDaysOfWeek: [existing.recurrenceDayOfWeek],
      recurrenceDayOfWeek: existing.recurrenceDayOfWeek,
    }
  }
  return { recurrenceDaysOfWeek: null, recurrenceDayOfWeek: null }
}

const parseEventOccurrences = (
  eventOccurrences: unknown,
): { ok: true; dates: Array<{ eventStartDate: Date; eventEndDate: Date }> } | { ok: false; error: string } => {
  if (!eventOccurrences || !Array.isArray(eventOccurrences) || eventOccurrences.length === 0) {
    return { ok: false, error: 'No event occurrences provided' }
  }

  const dates: Array<{ eventStartDate: Date; eventEndDate: Date }> = []

  for (const occurrence of eventOccurrences) {
    if (!occurrence.startDate || !occurrence.endDate) {
      return { ok: false, error: 'Each event occurrence must have startDate and endDate' }
    }
    const occStart = new Date(occurrence.startDate)
    const occEnd = new Date(occurrence.endDate)
    if (isNaN(occStart.getTime()) || isNaN(occEnd.getTime())) {
      return { ok: false, error: 'Invalid date format in event occurrences' }
    }
    if (occStart > occEnd) {
      return { ok: false, error: 'End date must be on or after start date for each occurrence' }
    }
    dates.push({ eventStartDate: occStart, eventEndDate: occEnd })
  }

  return { ok: true, dates }
}

const buildEventRowData = (
  base: {
    eventType: EventType
    title: string
    description: string
    venueId: string
    allowReservation: boolean
    frequencyType: FrequencyType
    poster: string
    entryFee: number | null
    selectedServices: AddOnService[] | null
    locationId: string
    maxCapacity: number | null
    reservationPerFlat: number | null
    recurrenceDayOfWeek: number | null
    recurrenceDaysOfWeek: number[] | null
    recurrenceDayOfMonth: number | null
    recurrenceMonth: number | null
    createdBy: string
    updatedBy: string
    createdAt?: Date
  },
  occurrence: { eventStartDate: Date; eventEndDate: Date },
) => ({
  ...base,
  startDate: occurrence.eventStartDate,
  endDate: occurrence.eventEndDate,
})

export const createEvent = async (req: AuthenticatedRequest, res: Response) => {
  const transaction = await sequelize.transaction()

  try {
    const {
      eventType,
      title,
      description,
      startDate,
      endDate,
      venueId,
      allowReservation,
      frequencyType,
      entryFee,
      eventOccurrences,
    } = req.body
    const createdBy = req.user?.id
    const locationId = req.params.locationId as string
    const parsedSelectedServices = parseJsonBodyField<AddOnService[]>(req.body.selectedServices)
    const recurrenceConfig = parseRecurrenceConfig(req.body)
    const maxCapacity = parseOptionalInt(req.body.maxCapacity)
    const reservationPerFlat = parseOptionalInt(req.body.reservationPerFlat)

    const poster = getUploadedFilePath(req, 'poster') || ''

    if (!createdBy) {
      await transaction.rollback()
      return res.status(401).json(errorResponse('User not authenticated'))
    }

    const location = await Property.findByPk(locationId)
    if (!location) {
      await transaction.rollback()
      return res.status(404).json(errorResponse('Location not found'))
    }

    const venue = await Venue.findOne({
      where: { id: venueId, locationId, isDeleted: false },
    })

    if (!venue) {
      await transaction.rollback()
      return res.status(404).json(errorResponse('Venue not found in this location'))
    }

    const selectedResult = resolveSelectedServices(parsedSelectedServices, venue.addOnServices)
    if (!selectedResult.ok) {
      await transaction.rollback()
      return res.status(400).json(errorResponse(selectedResult.error))
    }

    const resolvedEventType = (eventType as EventType) || EventType.SPECIAL
    const resolvedFrequency = (frequencyType as FrequencyType) || FrequencyType.ONCE

    let eventDates: Array<{ eventStartDate: Date; eventEndDate: Date }> = []

    if (eventOccurrences && Array.isArray(eventOccurrences) && eventOccurrences.length > 0) {
      const parsed = parseEventOccurrences(eventOccurrences)
      if (!parsed.ok) {
        await transaction.rollback()
        return res.status(400).json(errorResponse(parsed.error))
      }
      eventDates = parsed.dates
    } else {
      if (!startDate || !endDate) {
        await transaction.rollback()
        return res
          .status(400)
          .json(errorResponse('startDate and endDate are required when eventOccurrences is not provided'))
      }
      const start = new Date(startDate)
      const end = new Date(endDate)
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        await transaction.rollback()
        return res.status(400).json(errorResponse('Invalid date format'))
      }
      if (start > end) {
        await transaction.rollback()
        return res.status(400).json(errorResponse('End date must be on or after start date'))
      }
      eventDates = generateRecurringEventDates(start, end, resolvedFrequency, recurrenceConfig)
      if (eventDates.length === 0) {
        await transaction.rollback()
        return res.status(400).json(errorResponse(getNoOccurrencesErrorMessage(resolvedFrequency, recurrenceConfig)))
      }
    }

    if (eventDates.length > 1000) {
      await transaction.rollback()
      return res
        .status(400)
        .json(errorResponse(`Too many events generated (${eventDates.length}). Maximum allowed is 1000.`))
    }

    const allowRes = allowReservation === true || allowReservation === 'true'

    const weeklyRecurrence = resolveStoredWeeklyRecurrence(recurrenceConfig)

    const baseRow = {
      eventType: resolvedEventType,
      title,
      description: description || '',
      venueId,
      allowReservation: allowRes,
      frequencyType: resolvedFrequency,
      poster,
      entryFee: entryFee !== undefined && entryFee !== '' ? parseFloat(entryFee) : null,
      selectedServices: selectedResult.services,
      locationId,
      maxCapacity: allowRes ? maxCapacity : null,
      reservationPerFlat: allowRes ? reservationPerFlat : null,
      recurrenceDayOfWeek: weeklyRecurrence.recurrenceDayOfWeek,
      recurrenceDaysOfWeek: weeklyRecurrence.recurrenceDaysOfWeek,
      recurrenceDayOfMonth: recurrenceConfig.recurrenceDayOfMonth ?? null,
      recurrenceMonth: recurrenceConfig.recurrenceMonth ?? null,
      createdBy,
      updatedBy: createdBy,
    }

    const eventsToCreate = eventDates.map((occ) => buildEventRowData(baseRow, occ))

    const createdEvents = await Event.bulkCreate(eventsToCreate, { transaction })
    await transaction.commit()

    const firstEvent = await Event.findByPk(createdEvents[0]!.id, {
      include: [
        { model: Venue, as: 'venue', attributes: ['id', 'name', 'occupancy', 'price'] },
        { model: Property, as: 'location', attributes: ['id', 'property_name'] },
      ],
    })

    return res.status(201).json(
      successResponse(`Successfully created ${createdEvents.length} event(s)`, {
        eventsCreated: createdEvents.length,
        firstEvent,
        frequencyType: resolvedFrequency,
      }),
    )
  } catch (error) {
    await transaction.rollback()
    console.error('Create Event Error:', error)
    return res.status(500).json(errorResponse('Failed to create event'))
  }
}

export const getAllEvents = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = req.params.locationId as string
    const {
      page = 1,
      limit = 10,
      search,
      eventType,
      venueId,
      dateFrom,
      dateTo,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = req.query

    const whereClause: Record<string, unknown> = {
      locationId,
      isDeleted: false,
    }

    if (search) {
      const searchTerm = String(search).trim()
      whereClause[Op.or as unknown as string] = [
        Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('Event.title')), {
          [Op.like]: `%${searchTerm.toLowerCase()}%`,
        }),
      ]
    }

    if (eventType) whereClause.eventType = eventType
    if (venueId) whereClause.venueId = venueId

    if (dateFrom || dateTo) {
      const dateConditions: Record<string, unknown>[] = []
      if (dateFrom) dateConditions.push({ endDate: { [Op.gte]: new Date(String(dateFrom)) } })
      if (dateTo) dateConditions.push({ startDate: { [Op.lte]: new Date(String(dateTo)) } })
      if (dateConditions.length > 0) {
        whereClause[Op.and as unknown as string] = (
          (whereClause[Op.and as unknown as string] as unknown[]) || []
        ).concat(dateConditions)
      }
    }

    const isAll = limit === 'all' || limit === 'ALL'
    const queryOptions: Record<string, unknown> = {
      where: whereClause,
      include: [
        { model: Venue, as: 'venue', attributes: ['id', 'name', 'occupancy', 'price'] },
        { model: Property, as: 'location', attributes: ['id', 'property_name'] },
      ],
      order: [[String(sortBy), String(sortOrder)]],
    }

    if (!isAll) {
      const limitNum = parseInt(String(limit))
      const pageNum = parseInt(String(page))
      queryOptions.limit = limitNum
      queryOptions.offset = (pageNum - 1) * limitNum
    }

    const { count, rows } = await Event.findAndCountAll(queryOptions)

    const responseData: Record<string, unknown> = { events: rows }
    if (!isAll) {
      const limitNum = parseInt(String(limit))
      responseData.pagination = {
        page: parseInt(String(page)),
        limit: limitNum,
        total: count,
        totalPages: Math.ceil(count / limitNum),
      }
    } else {
      responseData.pagination = { total: count, limit: 'all' }
    }

    return res.status(200).json(successResponse('Events fetched successfully', responseData))
  } catch (error) {
    console.error('Get All Events Error:', error)
    return res.status(500).json(errorResponse('Failed to fetch events'))
  }
}

export const getEventById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = req.params.locationId as string
    const id = req.params.id as string

    const event = await Event.findOne({
      where: { id, locationId, isDeleted: false },
      include: [
        {
          model: Venue,
          as: 'venue',
          attributes: [
            'id',
            'name',
            'occupancy',
            'price',
            'keyFeatures',
            'otherServices',
            'coverPhoto',
            'images',
            'addOnServices',
          ],
        },
        { model: Property, as: 'location', attributes: ['id', 'property_name'] },
      ],
    })

    if (!event) {
      return res.status(404).json(errorResponse('Event not found'))
    }

    return res.status(200).json(successResponse('Event fetched successfully', event))
  } catch (error) {
    console.error('Get Event Error:', error)
    return res.status(500).json(errorResponse('Failed to fetch event'))
  }
}

export const updateEvent = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = req.params.locationId as string
    const id = req.params.id as string
    const {
      eventType,
      title,
      description,
      startDate,
      endDate,
      venueId,
      allowReservation,
      frequencyType,
      entryFee,
      eventOccurrences,
    } = req.body
    const updatedBy = req.user?.id
    const parsedSelectedServices = parseJsonBodyField<AddOnService[]>(req.body.selectedServices)
    const recurrenceConfig = parseRecurrenceConfig(req.body)
    const maxCapacity = parseOptionalInt(req.body.maxCapacity)
    const reservationPerFlat = parseOptionalInt(req.body.reservationPerFlat)

    const poster = getUploadedFilePath(req, 'poster')

    if (!updatedBy) {
      return res.status(401).json(errorResponse('User not authenticated'))
    }

    const event = await Event.findOne({
      where: { id, locationId, isDeleted: false },
    })

    if (!event) {
      return res.status(404).json(errorResponse('Event not found'))
    }

    const targetVenueId = venueId || event.venueId
    const venue = await Venue.findOne({
      where: { id: targetVenueId, locationId, isDeleted: false },
    })
    if (!venue) {
      return res.status(404).json(errorResponse('Venue not found in this location'))
    }

    let resolvedSelectedServices = event.selectedServices
    if (parsedSelectedServices !== undefined) {
      const selectedResult = resolveSelectedServices(parsedSelectedServices, venue.addOnServices)
      if (!selectedResult.ok) {
        return res.status(400).json(errorResponse(selectedResult.error))
      }
      resolvedSelectedServices = selectedResult.services
    } else if (venueId && venueId !== event.venueId) {
      resolvedSelectedServices = null
    }

    const resolvedEventType = (eventType as EventType) || event.eventType
    const freqType = (frequencyType as FrequencyType) || event.frequencyType

    let eventDates: Array<{ eventStartDate: Date; eventEndDate: Date }> = []

    if (eventOccurrences && Array.isArray(eventOccurrences) && eventOccurrences.length > 0) {
      const parsed = parseEventOccurrences(eventOccurrences)
      if (!parsed.ok) {
        return res.status(400).json(errorResponse(parsed.error))
      }
      eventDates = parsed.dates
    } else {
      const start = startDate ? new Date(startDate) : event.startDate
      const end = endDate ? new Date(endDate) : event.endDate

      if (start > end) {
        return res.status(400).json(errorResponse('End date must be on or after start date'))
      }

      const config: RecurrenceConfig = {}
      const weeklyRecurrence = resolveStoredWeeklyRecurrence(recurrenceConfig, {
        recurrenceDayOfWeek: event.recurrenceDayOfWeek,
        recurrenceDaysOfWeek: event.recurrenceDaysOfWeek,
      })
      if (weeklyRecurrence.recurrenceDaysOfWeek) {
        config.recurrenceDaysOfWeek = weeklyRecurrence.recurrenceDaysOfWeek
      }
      const dayOfMonth = recurrenceConfig.recurrenceDayOfMonth ?? event.recurrenceDayOfMonth
      const month = recurrenceConfig.recurrenceMonth ?? event.recurrenceMonth
      if (dayOfMonth != null) config.recurrenceDayOfMonth = dayOfMonth
      if (month != null) config.recurrenceMonth = month

      eventDates = generateRecurringEventDates(start, end, freqType, config)

      if (eventDates.length === 0) {
        return res.status(400).json(errorResponse(getNoOccurrencesErrorMessage(freqType, config)))
      }
    }

    if (eventDates.length > 1000) {
      return res
        .status(400)
        .json(errorResponse(`Too many events generated (${eventDates.length}). Maximum allowed is 1000.`))
    }

    const targetTitle = title || event.title
    const targetCreatedAt = event.createdAt
    const allowRes =
      allowReservation !== undefined ? allowReservation === true || allowReservation === 'true' : event.allowReservation

    const siblingEvents = await Event.findAll({
      where: {
        locationId,
        id: { [Op.ne]: event.id },
        isDeleted: false,
        venueId: targetVenueId,
        title: targetTitle,
        createdAt: targetCreatedAt,
      },
    })

    if (siblingEvents.length > 0) {
      await Event.update({ isDeleted: true, updatedBy }, { where: { id: { [Op.in]: siblingEvents.map((s) => s.id) } } })
    }

    const resolvedMaxCapacity = allowRes ? (maxCapacity ?? event.maxCapacity) : null
    const resolvedReservationPerFlat = allowRes ? (reservationPerFlat ?? event.reservationPerFlat) : null
    const resolvedWeeklyRecurrence = resolveStoredWeeklyRecurrence(recurrenceConfig, {
      recurrenceDayOfWeek: event.recurrenceDayOfWeek,
      recurrenceDaysOfWeek: event.recurrenceDaysOfWeek,
    })
    const resolvedRecurrenceDayOfMonth = recurrenceConfig.recurrenceDayOfMonth ?? event.recurrenceDayOfMonth
    const resolvedRecurrenceMonth = recurrenceConfig.recurrenceMonth ?? event.recurrenceMonth

    const firstOcc = eventDates[0]!
    await event.update({
      eventType: resolvedEventType,
      title: title || event.title,
      description: description !== undefined ? description : event.description,
      startDate: firstOcc.eventStartDate,
      endDate: firstOcc.eventEndDate,
      venueId: targetVenueId,
      allowReservation: allowRes,
      frequencyType: freqType,
      maxCapacity: resolvedMaxCapacity,
      reservationPerFlat: resolvedReservationPerFlat,
      recurrenceDayOfWeek: resolvedWeeklyRecurrence.recurrenceDayOfWeek,
      recurrenceDaysOfWeek: resolvedWeeklyRecurrence.recurrenceDaysOfWeek,
      recurrenceDayOfMonth: resolvedRecurrenceDayOfMonth,
      recurrenceMonth: resolvedRecurrenceMonth,
      poster: poster !== undefined ? poster : event.poster,
      entryFee:
        entryFee !== undefined ? (entryFee !== null && entryFee !== '' ? parseFloat(entryFee) : null) : event.entryFee,
      selectedServices: resolvedSelectedServices,
      updatedBy,
    })

    if (eventDates.length > 1) {
      const additionalOccurrences = eventDates.slice(1)
      const eventsToCreate = additionalOccurrences.map((occ) => ({
        eventType: resolvedEventType,
        title: title || event.title,
        description: description !== undefined ? description : event.description,
        startDate: occ.eventStartDate,
        endDate: occ.eventEndDate,
        venueId: targetVenueId,
        allowReservation: allowRes,
        frequencyType: freqType,
        maxCapacity: resolvedMaxCapacity,
        reservationPerFlat: resolvedReservationPerFlat,
        recurrenceDayOfWeek: resolvedWeeklyRecurrence.recurrenceDayOfWeek,
        recurrenceDaysOfWeek: resolvedWeeklyRecurrence.recurrenceDaysOfWeek,
        recurrenceDayOfMonth: resolvedRecurrenceDayOfMonth,
        recurrenceMonth: resolvedRecurrenceMonth,
        poster: poster !== undefined ? poster : event.poster,
        entryFee:
          entryFee !== undefined
            ? entryFee !== null && entryFee !== ''
              ? parseFloat(entryFee)
              : null
            : event.entryFee,
        selectedServices: resolvedSelectedServices,
        locationId,
        createdBy: updatedBy,
        updatedBy,
        createdAt: targetCreatedAt,
      }))

      await Event.bulkCreate(eventsToCreate)
    }

    const updatedEvent = await Event.findByPk(event.id, {
      include: [
        { model: Venue, as: 'venue', attributes: ['id', 'name', 'occupancy', 'price'] },
        { model: Property, as: 'location', attributes: ['id', 'property_name'] },
      ],
    })

    return res.status(200).json(successResponse('Event updated successfully', updatedEvent))
  } catch (error) {
    console.error('Update Event Error:', error)
    return res.status(500).json(errorResponse('Failed to update event'))
  }
}

export const deleteEvent = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = req.params.locationId as string
    const id = req.params.id as string
    const updatedBy = req.user?.id

    if (!updatedBy) {
      return res.status(401).json(errorResponse('User not authenticated'))
    }

    const event = await Event.findOne({
      where: { id, locationId, isDeleted: false },
    })

    if (!event) {
      return res.status(404).json(errorResponse('Event not found'))
    }

    await event.update({ isDeleted: true, updatedBy })

    return res.status(200).json(successResponse('Event deleted successfully'))
  } catch (error) {
    console.error('Delete Event Error:', error)
    return res.status(500).json(errorResponse('Failed to delete event'))
  }
}

export const bulkDeleteEvents = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = req.params.locationId as string
    const { ids, eventIds } = req.body
    const updatedBy = req.user?.id

    if (!updatedBy) {
      return res.status(401).json(errorResponse('User not authenticated'))
    }

    const targetIds = ids || eventIds

    if (!targetIds || !Array.isArray(targetIds) || targetIds.length === 0) {
      return res.status(400).json(errorResponse('Please provide an array of event IDs to delete'))
    }

    const events = await Event.findAll({
      where: { id: { [Op.in]: targetIds }, locationId, isDeleted: false },
    })

    if (events.length === 0) {
      return res.status(404).json(errorResponse('No matching events found to delete'))
    }

    const foundIds = events.map((e) => e.id)

    await Event.update({ isDeleted: true, updatedBy }, { where: { id: { [Op.in]: foundIds }, locationId } })

    return res.status(200).json(
      successResponse(`Successfully deleted ${foundIds.length} event(s)`, {
        deletedCount: foundIds.length,
        deletedIds: foundIds,
      }),
    )
  } catch (error) {
    console.error('Bulk Delete Events Error:', error)
    return res.status(500).json(errorResponse('Failed to bulk delete events'))
  }
}

export const getEventsCalendar = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = req.params.locationId as string
    const { view = 'month', year, month, weekStart, date } = req.query

    let startDate: Date
    let endDate: Date
    const viewType = String(view).toLowerCase()

    if (viewType === 'day') {
      if (!date) {
        return res.status(400).json(errorResponse('Date is required for day view'))
      }
      const dayDate = new Date(String(date))
      if (isNaN(dayDate.getTime())) {
        return res.status(400).json(errorResponse('Invalid date format'))
      }
      startDate = new Date(
        Date.UTC(dayDate.getUTCFullYear(), dayDate.getUTCMonth(), dayDate.getUTCDate() - 1, 0, 0, 0, 0),
      )
      endDate = new Date(
        Date.UTC(dayDate.getUTCFullYear(), dayDate.getUTCMonth(), dayDate.getUTCDate() + 1, 23, 59, 59, 999),
      )
    } else if (viewType === 'week') {
      if (!weekStart) {
        return res.status(400).json(errorResponse('weekStart date is required for week view'))
      }
      const weekStartDate = new Date(String(weekStart))
      if (isNaN(weekStartDate.getTime())) {
        return res.status(400).json(errorResponse('Invalid weekStart date format'))
      }
      const dayOfWeek = weekStartDate.getUTCDay()
      startDate = new Date(
        Date.UTC(
          weekStartDate.getUTCFullYear(),
          weekStartDate.getUTCMonth(),
          weekStartDate.getUTCDate() - dayOfWeek - 1,
          0,
          0,
          0,
          0,
        ),
      )
      endDate = new Date(
        Date.UTC(
          weekStartDate.getUTCFullYear(),
          weekStartDate.getUTCMonth(),
          weekStartDate.getUTCDate() - dayOfWeek + 7,
          23,
          59,
          59,
          999,
        ),
      )
    } else {
      if (!year || !month) {
        return res.status(400).json(errorResponse('Year and month are required for month view'))
      }
      const yearNum = parseInt(String(year), 10)
      const monthNum = parseInt(String(month), 10)
      if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
        return res.status(400).json(errorResponse('Invalid year or month'))
      }
      startDate = new Date(Date.UTC(yearNum, monthNum - 1, 0, 0, 0, 0, 0))
      endDate = new Date(Date.UTC(yearNum, monthNum, 1, 23, 59, 59, 999))
    }

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json(errorResponse('Invalid date range'))
    }

    const events = await Event.findAll({
      where: {
        locationId,
        isDeleted: false,
        [Op.and]: [{ startDate: { [Op.lte]: endDate } }, { endDate: { [Op.gte]: startDate } }],
      },
      include: [{ model: Venue, as: 'venue', attributes: ['id', 'name'] }],
      order: [['startDate', 'ASC']],
    })

    const eventsByDate: Record<string, unknown[]> = {}
    events.forEach((event) => {
      const evtStart = new Date(event.startDate)
      const evtEnd = new Date(event.endDate)

      if (!isNaN(evtStart.getTime()) && !isNaN(evtEnd.getTime())) {
        const pushKey = (dateKey: string) => {
          if (!eventsByDate[dateKey]) eventsByDate[dateKey] = []
          const bucket = eventsByDate[dateKey]!
          if (!bucket.some((e) => (e as { id?: string }).id === event.id)) {
            bucket.push(event)
          }
        }

        const utcCurrent = new Date(
          Date.UTC(evtStart.getUTCFullYear(), evtStart.getUTCMonth(), evtStart.getUTCDate(), 0, 0, 0, 0),
        )
        const utcEnd = new Date(
          Date.UTC(evtEnd.getUTCFullYear(), evtEnd.getUTCMonth(), evtEnd.getUTCDate(), 0, 0, 0, 0),
        )
        while (utcCurrent <= utcEnd) {
          pushKey(utcCurrent.toISOString().split('T')[0]!)
          utcCurrent.setUTCDate(utcCurrent.getUTCDate() + 1)
        }

        const localCurrent = new Date(evtStart.getFullYear(), evtStart.getMonth(), evtStart.getDate())
        const localEnd = new Date(evtEnd.getFullYear(), evtEnd.getMonth(), evtEnd.getDate())
        while (localCurrent <= localEnd) {
          const y = localCurrent.getFullYear()
          const m = String(localCurrent.getMonth() + 1).padStart(2, '0')
          const d = String(localCurrent.getDate()).padStart(2, '0')
          pushKey(`${y}-${m}-${d}`)
          localCurrent.setDate(localCurrent.getDate() + 1)
        }
      }
    })

    const responseData: Record<string, unknown> = {
      view: viewType,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      eventsByDate,
      events,
    }

    if (viewType === 'week') {
      const weekDays: Record<string, unknown[]> = {}
      for (let i = 0; i < 7; i++) {
        const currentDay = new Date(
          Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate() + i, 0, 0, 0, 0),
        )
        const dayKey = currentDay.toISOString().split('T')[0]!
        weekDays[dayKey] = eventsByDate[dayKey] || []
      }
      responseData.weekDays = weekDays
    } else if (viewType === 'day') {
      const dayKey = startDate.toISOString().split('T')[0]!
      responseData.dayEvents = eventsByDate[dayKey] || []
    }

    return res.status(200).json(successResponse('Events calendar fetched successfully', responseData))
  } catch (error) {
    console.error('Get Events Calendar Error:', error)
    return res.status(500).json(errorResponse('Failed to fetch events calendar'))
  }
}
