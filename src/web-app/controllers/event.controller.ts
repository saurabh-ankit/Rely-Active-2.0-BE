import { Response, Request } from 'express'
import { Op, Sequelize } from 'sequelize'
import sequelize from '../../config/db/index.js'
import { EventType, FrequencyType, RegistrationStatus } from '../../enums/event.enum.js'
import { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import {
  Event,
  Property,
  EventVenue,
  EventRegistration,
  Resident,
  EventGlobalServiceProperty,
  EventGlobalService,
} from '../../models/index.js'
import { AddOnService } from '../../models/eventVenue.model.js'
import {
  generateRecurringEventDates,
  getNoOccurrencesErrorMessage,
  getWeeklyRecurrenceDays,
  RecurrenceConfig,
  parseJsonBodyField,
  getUploadedFilePath,
  getUploadedFilePaths,
  normalizeServiceQuantity,
  parsePositiveInt,
  getAllocatedQuantity,
  getAllocatedQuantitiesByService,
} from '../../utils/event.util.js'
import { errorResponse, successResponse } from '../../utils/response/index.js'
import { EventRegistrationAttributes } from '../../models/eventRegistration.model.js'
import { uploadFileToS3, uploadBase64ToS3 } from '../../middlewares/s3/index.js'

// ─── From event.controller.ts ───────────────────────────────────────────
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

    const venue = await EventVenue.findOne({
      where: { id: venueId, locationId, isDeleted: false },
    })

    if (!venue) {
      await transaction.rollback()
      return res.status(404).json(errorResponse('EventVenue not found in this location'))
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
        { model: EventVenue, as: 'venue', attributes: ['id', 'name', 'occupancy', 'price'] },
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
        { model: EventVenue, as: 'venue', attributes: ['id', 'name', 'occupancy', 'price'] },
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
          model: EventVenue,
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
    const venue = await EventVenue.findOne({
      where: { id: targetVenueId, locationId, isDeleted: false },
    })
    if (!venue) {
      return res.status(404).json(errorResponse('EventVenue not found in this location'))
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
        { model: EventVenue, as: 'venue', attributes: ['id', 'name', 'occupancy', 'price'] },
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
      include: [{ model: EventVenue, as: 'venue', attributes: ['id', 'name'] }],
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

// ─── From eventRegistration.controller.ts ───────────────────────────────────────────
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
      include: [{ model: EventVenue, as: 'venue', attributes: ['id', 'name', 'occupancy'], required: false }],
    })

    if (!event) {
      return res.status(404).json(errorResponse('Event not found'))
    }

    let venue = (event as Event & { venue?: EventVenue }).venue
    if (!venue && event.venueId) {
      venue =
        (await EventVenue.findOne({
          where: { id: event.venueId, locationId, isDeleted: false },
          attributes: ['id', 'name', 'occupancy'],
        })) ||
        (await EventVenue.findOne({
          where: { id: event.venueId, isDeleted: false },
          attributes: ['id', 'name', 'occupancy'],
        })) ||
        undefined
    }

    if (!venue) {
      return res.status(404).json(errorResponse('EventVenue not found for this event'))
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

// ─── From venue.controller.ts ───────────────────────────────────────────
type VenueImage = { url: string; caption?: string }

const parseVenueJsonFields = (body: Record<string, unknown>) => ({
  images: parseJsonBodyField<VenueImage[]>(body.images),
  addOnServices: parseJsonBodyField<AddOnService[]>(body.addOnServices),
})

async function validateVenueAddOnServices(
  locationId: string,
  addOnServices: AddOnService[] | null | undefined,
  excludeVenueId?: string,
): Promise<{ ok: true; services: AddOnService[] | null } | { ok: false; error: string }> {
  if (addOnServices === undefined || addOnServices === null) {
    return { ok: true, services: null }
  }
  if (!Array.isArray(addOnServices)) {
    return { ok: false, error: 'addOnServices must be an array' }
  }
  if (addOnServices.length === 0) {
    return { ok: true, services: [] }
  }

  const validated: AddOnService[] = []

  for (const item of addOnServices) {
    if (!item || typeof item.name !== 'string' || !item.name.trim()) {
      return { ok: false, error: 'Each add-on service must have a name' }
    }

    const quantity = parsePositiveInt(item.quantity)
    if (quantity === null) {
      return { ok: false, error: `Quantity must be at least 1 for service "${item.name}"` }
    }

    if (item.globalServiceId) {
      const assignment = await EventGlobalServiceProperty.findOne({
        where: { locId: locationId, globalServiceId: item.globalServiceId, isActive: true },
      })
      if (!assignment) {
        return { ok: false, error: `Service "${item.name}" is not assigned to this location` }
      }

      const otherAllocated = await getAllocatedQuantity(locationId, item.globalServiceId, excludeVenueId)
      const propertyQuantity = Number(assignment.quantity)
      if (otherAllocated + quantity > propertyQuantity) {
        const available = Math.max(0, propertyQuantity - otherAllocated)
        return {
          ok: false,
          error: `Quantity for "${item.name}" exceeds available stock (${available} remaining)`,
        }
      }
    }

    validated.push({
      ...item,
      name: item.name.trim(),
      quantity,
    })
  }

  return { ok: true, services: validated }
}

export const createVenue = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, occupancy, price, keyFeatures, otherServices } = req.body
    const { images, addOnServices } = parseVenueJsonFields(req.body)
    const createdBy = req.user?.id
    const locationId = req.params.locationId as string

    if (!createdBy) {
      return res.status(401).json(errorResponse('User not authenticated'))
    }

    const location = await Property.findByPk(locationId)
    if (!location) {
      return res.status(404).json(errorResponse('Location not found'))
    }

    const existingVenue = await EventVenue.findOne({
      where: { name, locationId, isDeleted: false },
    })

    if (existingVenue) {
      return res.status(400).json(errorResponse('EventVenue name already exists in this location'))
    }

    const coverPhoto = getUploadedFilePath(req, 'coverPhoto') || ''
    const uploadedImages = getUploadedFilePaths(req, 'images').map((url) => ({ url }))

    let finalImages = uploadedImages
    if (images && Array.isArray(images) && images.length > 0) {
      if (uploadedImages.length > 0) {
        finalImages = uploadedImages.map((uploaded, index) => {
          const bodyImage = images[index]
          if (bodyImage?.caption) {
            return { url: uploaded.url, caption: bodyImage.caption }
          }
          return uploaded
        })
      } else {
        finalImages = images
      }
    }

    const addOnValidation = await validateVenueAddOnServices(locationId, addOnServices)
    if (!addOnValidation.ok) {
      return res.status(400).json(errorResponse(addOnValidation.error))
    }

    const venue = await EventVenue.create({
      name,
      occupancy: occupancy !== undefined ? parseInt(String(occupancy), 10) : occupancy,
      price: price !== undefined ? Number(price) || 0 : 0,
      keyFeatures,
      otherServices,
      coverPhoto,
      images: finalImages.length > 0 ? finalImages : null,
      addOnServices: addOnValidation.services ?? null,
      locationId,
      createdBy,
      updatedBy: createdBy,
    })

    return res.status(201).json(successResponse('EventVenue created successfully', venue))
  } catch (error) {
    console.error('Create EventVenue Error:', error)
    return res.status(500).json(errorResponse('Failed to create venue'))
  }
}

export const getAllVenues = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = req.params.locationId as string
    const { page = 1, limit = 10, search, sortBy = 'createdAt', sortOrder = 'DESC' } = req.query

    const offset = (parseInt(String(page)) - 1) * parseInt(String(limit))
    const whereClause: Record<string, unknown> = {
      locationId,
      isDeleted: false,
    }

    if (search) {
      const searchTerm = String(search).trim()
      whereClause[Op.or as unknown as string] = [
        Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('EventVenue.name')), {
          [Op.like]: `%${searchTerm.toLowerCase()}%`,
        }),
      ]
    }

    const { count, rows } = await EventVenue.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Property,
          as: 'location',
          attributes: ['id', 'property_name'],
        },
      ],
      order: [[String(sortBy), String(sortOrder)]],
      limit: parseInt(String(limit)),
      offset,
    })

    return res.status(200).json(
      successResponse('Venues fetched successfully', {
        venues: rows,
        pagination: {
          page: parseInt(String(page)),
          limit: parseInt(String(limit)),
          total: count,
          totalPages: Math.ceil(count / parseInt(String(limit))),
        },
      }),
    )
  } catch (error) {
    console.error('Get All Venues Error:', error)
    return res.status(500).json(errorResponse('Failed to fetch venues'))
  }
}

export const getVenueById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const locationId = req.params.locationId as string

    const venue = await EventVenue.findOne({
      where: { id, locationId, isDeleted: false },
      include: [
        {
          model: Property,
          as: 'location',
          attributes: ['id', 'property_name'],
        },
      ],
    })

    if (!venue) {
      return res.status(404).json(errorResponse('EventVenue not found'))
    }

    return res.status(200).json(successResponse('EventVenue fetched successfully', venue))
  } catch (error) {
    console.error('Get EventVenue Error:', error)
    return res.status(500).json(errorResponse('Failed to fetch venue'))
  }
}

export const updateVenue = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const locationId = req.params.locationId as string
    const { name, occupancy, price, keyFeatures, otherServices } = req.body
    const { images, addOnServices } = parseVenueJsonFields(req.body)
    const updatedBy = req.user?.id

    if (!updatedBy) {
      return res.status(401).json(errorResponse('User not authenticated'))
    }

    const venue = await EventVenue.findOne({
      where: { id, locationId, isDeleted: false },
    })

    if (!venue) {
      return res.status(404).json(errorResponse('EventVenue not found'))
    }

    if (name && name !== venue.name) {
      const existingVenue = await EventVenue.findOne({
        where: {
          name,
          locationId,
          id: { [Op.ne]: id },
          isDeleted: false,
        },
      })

      if (existingVenue) {
        return res.status(400).json(errorResponse('EventVenue name already exists in this location'))
      }
    }

    const coverPhoto = getUploadedFilePath(req, 'coverPhoto')
    const uploadedImages = getUploadedFilePaths(req, 'images').map((url) => ({ url }))

    let finalImages: Array<{ url: string; caption?: string }> | undefined
    if (uploadedImages.length > 0) {
      if (images && Array.isArray(images) && images.length > 0) {
        finalImages = uploadedImages.map((uploaded, index) => {
          const bodyImage = images[index]
          if (bodyImage?.caption) {
            return { url: uploaded.url, caption: bodyImage.caption }
          }
          return uploaded
        })
      } else {
        finalImages = uploadedImages
      }
    } else if (images !== undefined) {
      finalImages = images
    }

    let validatedAddOnServices: AddOnService[] | null | undefined
    if (addOnServices !== undefined) {
      const addOnValidation = await validateVenueAddOnServices(locationId, addOnServices, id)
      if (!addOnValidation.ok) {
        return res.status(400).json(errorResponse(addOnValidation.error))
      }
      validatedAddOnServices = addOnValidation.services
    }

    await venue.update({
      name: name || venue.name,
      occupancy: occupancy !== undefined ? parseInt(String(occupancy), 10) : venue.occupancy,
      price: price !== undefined ? Number(price) : venue.price,
      keyFeatures: keyFeatures || venue.keyFeatures,
      otherServices: otherServices !== undefined ? otherServices : venue.otherServices,
      coverPhoto: coverPhoto !== undefined ? coverPhoto : venue.coverPhoto,
      images: finalImages !== undefined ? finalImages : venue.images,
      addOnServices: validatedAddOnServices !== undefined ? validatedAddOnServices : venue.addOnServices,
      updatedBy,
    })

    return res.status(200).json(successResponse('EventVenue updated successfully', venue))
  } catch (error) {
    console.error('Update EventVenue Error:', error)
    return res.status(500).json(errorResponse('Failed to update venue'))
  }
}

export const deleteVenue = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const locationId = req.params.locationId as string
    const updatedBy = req.user?.id

    if (!updatedBy) {
      return res.status(401).json(errorResponse('User not authenticated'))
    }

    const venue = await EventVenue.findOne({
      where: { id, locationId, isDeleted: false },
    })

    if (!venue) {
      return res.status(404).json(errorResponse('EventVenue not found'))
    }

    await venue.update({ isDeleted: true, updatedBy })

    return res.status(200).json(successResponse('EventVenue deleted successfully'))
  } catch (error) {
    console.error('Delete EventVenue Error:', error)
    return res.status(500).json(errorResponse('Failed to delete venue'))
  }
}

// ─── From globalService.controller.ts ───────────────────────────────────────────
interface PropertyAssignmentInput {
  locId: string
  price?: number | string
  quantity?: number | string
}

function parsePropertyAssignments(raw: unknown): PropertyAssignmentInput[] {
  if (Array.isArray(raw)) {
    return raw as PropertyAssignmentInput[]
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function validatePropertyAssignments(
  assignments: PropertyAssignmentInput[],
):
  | { ok: true; assignments: Array<{ locId: string; price: number; quantity: number }> }
  | { ok: false; message: string } {
  const normalized: Array<{ locId: string; price: number; quantity: number }> = []

  for (const pa of assignments) {
    if (!pa.locId) continue
    const quantity = parsePositiveInt(pa.quantity)
    if (quantity === null) {
      return { ok: false, message: 'Quantity must be at least 1 for each assigned property' }
    }
    normalized.push({
      locId: pa.locId,
      price: Number(pa.price) || 0,
      quantity,
    })
  }

  return { ok: true, assignments: normalized }
}

async function validatePropertyQuantityReductions(
  globalServiceId: string,
  assignments: Array<{ locId: string; quantity: number }>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  for (const pa of assignments) {
    const allocated = await getAllocatedQuantity(pa.locId, globalServiceId)
    if (allocated > pa.quantity) {
      return {
        ok: false,
        message: `Cannot set quantity to ${pa.quantity}. ${allocated} units are already allocated across venues.`,
      }
    }
  }
  return { ok: true }
}

async function resolveImageUrl(
  req: AuthenticatedRequest,
  imageUrl: string | undefined,
  existingUrl: string | null,
): Promise<string | null> {
  if (req.file) {
    const s3Res = await uploadFileToS3(req.file, 'global-services')
    return s3Res.location
  }
  if (imageUrl !== undefined) {
    if (!imageUrl) return null
    return uploadBase64ToS3(imageUrl, 'global-services')
  }
  return existingUrl
}

export async function getAllGlobalServices(_req: Request, res: Response): Promise<void> {
  try {
    const services = await EventGlobalService.findAll({
      include: [
        {
          model: EventGlobalServiceProperty,
          as: 'propertyServices',
          include: [
            {
              model: Property,
              as: 'property',
              attributes: ['id', 'property_name', 'street', 'city', 'state'],
            },
          ],
        },
      ],
      order: [['createdAt', 'DESC']],
    })

    res.status(200).json({
      success: true,
      data: services,
    })
  } catch (error) {
    console.error('Error fetching global services:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch global services' })
  }
}

export async function getLocationGlobalServices(req: Request, res: Response): Promise<void> {
  try {
    const locationId = req.params.locationId as string

    const services = await EventGlobalService.findAll({
      where: { isActive: true },
      include: [
        {
          model: EventGlobalServiceProperty,
          as: 'propertyServices',
          where: { locId: locationId, isActive: true },
          required: true,
          attributes: ['id', 'locId', 'price', 'quantity', 'isActive'],
        },
      ],
      order: [['name', 'ASC']],
    })

    const allocatedByService = await getAllocatedQuantitiesByService(locationId)

    const data = services.map((service) => {
      const assignment = service.propertyServices?.[0]
      const json = service.toJSON() as EventGlobalService & {
        propertyServices?: EventGlobalServiceProperty[]
      }
      const locationQuantity = assignment ? Number(assignment.quantity) : 1
      const allocatedQuantity = allocatedByService.get(json.id) ?? 0
      const availableQuantity = Math.max(0, locationQuantity - allocatedQuantity)

      return {
        id: json.id,
        name: json.name,
        description: json.description,
        basePrice: json.basePrice,
        imageUrl: json.imageUrl,
        isActive: json.isActive,
        locationPrice: assignment ? Number(assignment.price) : json.basePrice,
        locationAssignmentId: assignment?.id ?? null,
        locationQuantity,
        allocatedQuantity,
        availableQuantity,
      }
    })

    res.status(200).json({
      success: true,
      message: 'Location global services fetched successfully',
      data,
    })
  } catch (error) {
    console.error('Error fetching location global services:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch location global services' })
  }
}

export async function createGlobalService(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { name, description, basePrice, imageUrl, isActive, propertyAssignments } = req.body

    const finalImageUrl = await resolveImageUrl(req, imageUrl, null)
    const parsedAssignments = parsePropertyAssignments(propertyAssignments)
    const validation = validatePropertyAssignments(parsedAssignments)
    if (!validation.ok) {
      res.status(400).json({ success: false, message: validation.message })
      return
    }

    const service = await EventGlobalService.create({
      name: name.trim(),
      description: description || null,
      basePrice: Number(basePrice) || 0,
      imageUrl: finalImageUrl,
      isActive: isActive !== undefined ? String(isActive) === 'true' || isActive === true : true,
      createdBy: req.user?.id || null,
    })

    for (const pa of validation.assignments) {
      await EventGlobalServiceProperty.create({
        locId: pa.locId,
        globalServiceId: service.id,
        price: pa.price || Number(basePrice) || 0,
        quantity: pa.quantity,
        isActive: true,
        createdBy: req.user?.id || null,
      })
    }

    const reloaded = await EventGlobalService.findByPk(service.id, {
      include: [
        {
          model: EventGlobalServiceProperty,
          as: 'propertyServices',
          include: [
            { model: Property, as: 'property', attributes: ['id', 'property_name', 'street', 'city', 'state'] },
          ],
        },
      ],
    })

    res.status(201).json({
      success: true,
      message: 'Global service created successfully',
      data: reloaded ? reloaded.toJSON() : service.toJSON(),
    })
  } catch (error) {
    console.error('Error creating global service:', error)
    res.status(500).json({ success: false, message: 'Failed to create global service' })
  }
}

export async function updateGlobalService(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const { name, description, basePrice, imageUrl, isActive, propertyAssignments } = req.body

    const service = await EventGlobalService.findByPk(id, {
      include: [{ model: EventGlobalServiceProperty, as: 'propertyServices' }],
    })
    if (!service) {
      res.status(404).json({ success: false, message: 'Global service not found' })
      return
    }

    const finalImageUrl = await resolveImageUrl(req, imageUrl, service.imageUrl)

    await service.update({
      name: name?.trim() || service.name,
      description: description !== undefined ? description || null : service.description,
      basePrice: basePrice !== undefined ? Number(basePrice) : service.basePrice,
      imageUrl: finalImageUrl,
      isActive: isActive !== undefined ? String(isActive) === 'true' || isActive === true : service.isActive,
      updatedBy: req.user?.id || null,
    })

    if (propertyAssignments !== undefined) {
      const parsedAssignments = parsePropertyAssignments(propertyAssignments)
      const validation = validatePropertyAssignments(parsedAssignments)
      if (!validation.ok) {
        res.status(400).json({ success: false, message: validation.message })
        return
      }

      const quantityCheck = await validatePropertyQuantityReductions(service.id, validation.assignments)
      if (!quantityCheck.ok) {
        res.status(400).json({ success: false, message: quantityCheck.message })
        return
      }

      const assignedLocIds = validation.assignments.map((pa) => pa.locId)

      for (const existing of service.propertyServices || []) {
        if (!assignedLocIds.includes(existing.locId)) {
          await existing.destroy()
        }
      }

      for (const pa of validation.assignments) {
        const existing = await EventGlobalServiceProperty.findOne({
          where: { locId: pa.locId, globalServiceId: service.id },
        })
        if (existing) {
          await existing.update({
            price: pa.price !== undefined ? Number(pa.price) : existing.price,
            quantity: pa.quantity,
            isActive: true,
            updatedBy: req.user?.id || null,
          })
        } else {
          await EventGlobalServiceProperty.create({
            locId: pa.locId,
            globalServiceId: service.id,
            price: pa.price || service.basePrice || 0,
            quantity: pa.quantity,
            isActive: true,
            createdBy: req.user?.id || null,
          })
        }
      }
    }

    const reloaded = await EventGlobalService.findByPk(service.id, {
      include: [
        {
          model: EventGlobalServiceProperty,
          as: 'propertyServices',
          include: [
            { model: Property, as: 'property', attributes: ['id', 'property_name', 'street', 'city', 'state'] },
          ],
        },
      ],
    })

    res.status(200).json({
      success: true,
      message: 'Global service updated successfully',
      data: reloaded ? reloaded.toJSON() : service.toJSON(),
    })
  } catch (error) {
    console.error('Error updating global service:', error)
    res.status(500).json({ success: false, message: 'Failed to update global service' })
  }
}

export async function deleteGlobalService(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const service = await EventGlobalService.findByPk(id)
    if (!service) {
      res.status(404).json({ success: false, message: 'Global service not found' })
      return
    }

    await EventGlobalServiceProperty.destroy({ where: { globalServiceId: id } })
    await service.destroy()

    res.status(200).json({ success: true, message: 'Global service deleted successfully' })
  } catch (error) {
    console.error('Error deleting global service:', error)
    res.status(500).json({ success: false, message: 'Failed to delete global service' })
  }
}
