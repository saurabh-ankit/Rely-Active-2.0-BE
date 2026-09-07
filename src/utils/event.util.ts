import type { Request } from 'express'
import { Op } from 'sequelize'
import { EventRequestStatus, FrequencyType } from '../enums/event.enum.js'
import { Event, EventRequest, EventVenue } from '../models/index.js'
import type { AddOnService } from '../models/eventVenue.model.js'

export const RESIDENT_CONFIRMED_EVENT_DESCRIPTION_PREFIX = 'Confirmed from resident request'

/**
 * Resident-confirmed bookings are created without an uploaded poster.
 * Use the venue cover photo as the display poster for those events only.
 */
export function resolveResidentRequestEventPoster(
  event: { poster?: string | null; description?: string | null },
  venue?: { coverPhoto?: string | null } | null,
): string | null {
  const existing = typeof event.poster === 'string' ? event.poster.trim() : ''
  if (existing) return existing

  const description = typeof event.description === 'string' ? event.description : ''
  const fromResidentRequest = description.startsWith(RESIDENT_CONFIRMED_EVENT_DESCRIPTION_PREFIX)
  if (fromResidentRequest && venue?.coverPhoto) {
    return venue.coverPhoto
  }

  return event.poster || null
}

// ── Event Recurrence Helpers ──────────────────────────────────────────────────
export interface RecurrenceConfig {
  recurrenceDayOfWeek?: number
  recurrenceDaysOfWeek?: number[]
  recurrenceDayOfMonth?: number
  recurrenceMonth?: number
}

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const getWeeklyRecurrenceDays = (config: RecurrenceConfig = {}): number[] => {
  if (Array.isArray(config.recurrenceDaysOfWeek) && config.recurrenceDaysOfWeek.length > 0) {
    return [...new Set(config.recurrenceDaysOfWeek.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b)
  }
  if (config.recurrenceDayOfWeek !== undefined && config.recurrenceDayOfWeek >= 0 && config.recurrenceDayOfWeek <= 6) {
    return [config.recurrenceDayOfWeek]
  }
  return []
}

export const formatWeeklyDayLabels = (days: number[]): string => {
  if (days.length === 0) return 'selected day'
  if (days.length === 1) return WEEKDAY_LABELS[days[0]!] || 'selected day'
  const labels = days.map((d) => WEEKDAY_LABELS[d] || 'day').filter(Boolean)
  if (labels.length <= 1) return labels[0] || 'selected days'
  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`
}

export interface EventDateRange {
  eventStartDate: Date
  eventEndDate: Date
}

const pad = (n: number) => String(n).padStart(2, '0')

export const toDateKey = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const applyTimeToDate = (date: Date, timeSource: Date): Date => {
  const result = new Date(date)
  result.setHours(timeSource.getHours(), timeSource.getMinutes(), timeSource.getSeconds(), timeSource.getMilliseconds())
  return result
}

const buildOccurrence = (date: Date, startTime: Date, endTime: Date): EventDateRange => {
  const eventStartDate = applyTimeToDate(date, startTime)
  let eventEndDate = applyTimeToDate(date, endTime)
  if (eventEndDate <= eventStartDate) {
    eventEndDate = new Date(eventEndDate)
    eventEndDate.setDate(eventEndDate.getDate() + 1)
  }
  return { eventStartDate, eventEndDate }
}

const getRangeBoundaries = (startDate: Date, endDate: Date) => {
  const rangeStart = new Date(startDate)
  rangeStart.setHours(0, 0, 0, 0)
  const rangeEnd = new Date(endDate)
  rangeEnd.setHours(23, 59, 59, 999)
  return { rangeStart, rangeEnd }
}

const daysInMonth = (year: number, month: number): number => new Date(year, month + 1, 0).getDate()

export const getOccurrenceDateKeys = (
  startDate: Date,
  endDate: Date,
  frequencyType: FrequencyType,
  config: RecurrenceConfig = {},
): string[] => {
  const { rangeStart, rangeEnd } = getRangeBoundaries(startDate, endDate)
  const dates: string[] = []

  if (frequencyType === FrequencyType.ONCE) {
    return [toDateKey(startDate)]
  }

  if (frequencyType === FrequencyType.DAILY) {
    const current = new Date(rangeStart)
    while (current <= rangeEnd) {
      dates.push(toDateKey(current))
      current.setDate(current.getDate() + 1)
    }
    return dates
  }

  if (frequencyType === FrequencyType.WEEKLY) {
    const weeklyDays = getWeeklyRecurrenceDays(config)
    if (weeklyDays.length === 0) return []
    const daysSet = new Set(weeklyDays)
    const current = new Date(rangeStart)
    while (current <= rangeEnd) {
      if (daysSet.has(current.getDay())) {
        dates.push(toDateKey(current))
      }
      current.setDate(current.getDate() + 1)
    }
    return dates.sort()
  }

  if (frequencyType === FrequencyType.MONTHLY) {
    if (!config.recurrenceDayOfMonth) return []
    const dayOfMonth = config.recurrenceDayOfMonth
    let year = rangeStart.getFullYear()
    let month = rangeStart.getMonth()

    while (year < rangeEnd.getFullYear() || (year === rangeEnd.getFullYear() && month <= rangeEnd.getMonth())) {
      const maxDay = daysInMonth(year, month)
      if (dayOfMonth <= maxDay) {
        const candidate = new Date(year, month, dayOfMonth)
        if (candidate >= rangeStart && candidate <= rangeEnd) {
          dates.push(toDateKey(candidate))
        }
      }
      month += 1
      if (month > 11) {
        month = 0
        year += 1
      }
    }
    return dates
  }

  if (frequencyType === FrequencyType.YEARLY) {
    if (!config.recurrenceMonth || !config.recurrenceDayOfMonth) return []
    const month = config.recurrenceMonth - 1
    const dayOfMonth = config.recurrenceDayOfMonth

    for (let year = rangeStart.getFullYear(); year <= rangeEnd.getFullYear(); year += 1) {
      const maxDay = daysInMonth(year, month)
      if (dayOfMonth <= maxDay) {
        const candidate = new Date(year, month, dayOfMonth)
        if (candidate >= rangeStart && candidate <= rangeEnd) {
          dates.push(toDateKey(candidate))
        }
      }
    }
    return dates
  }

  return dates
}

export const getNoOccurrencesErrorMessage = (frequencyType: FrequencyType, config: RecurrenceConfig): string => {
  if (frequencyType === FrequencyType.WEEKLY) {
    const dayLabel = formatWeeklyDayLabels(getWeeklyRecurrenceDays(config))
    return `No ${dayLabel} falls within the selected start and end date range`
  }
  if (frequencyType === FrequencyType.MONTHLY) {
    return 'No matching dates fall within the selected start and end date range for the chosen day of month'
  }
  if (frequencyType === FrequencyType.YEARLY) {
    return 'No matching dates fall within the selected start and end date range for the chosen date'
  }
  return 'No dates fall within the selected start and end date range'
}

export const generateRecurringEventDates = (
  startDate: Date,
  endDate: Date,
  frequencyType: FrequencyType,
  config: RecurrenceConfig = {},
): EventDateRange[] => {
  if (frequencyType === FrequencyType.ONCE) {
    return [{ eventStartDate: new Date(startDate), eventEndDate: new Date(endDate) }]
  }

  const dateKeys = getOccurrenceDateKeys(startDate, endDate, frequencyType, config)
  return dateKeys.map((key) => {
    const [y, m, d] = key.split('-').map(Number)
    const date = new Date(y!, m! - 1, d)
    return buildOccurrence(date, startDate, endDate)
  })
}

// ── JSON Body Parser Helper ───────────────────────────────────────────────────
export function parseJsonBodyField<T>(value: unknown): T | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return undefined
    }
  }
  return value as T
}

// ── Service Quantity Helpers ──────────────────────────────────────────────────
export const normalizeServiceQuantity = (quantity: unknown): number => {
  const parsed = parseInt(String(quantity ?? 1), 10)
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1
}

export const parsePositiveInt = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null
  const parsed = parseInt(String(value), 10)
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null
}

export const getAddOnServiceKey = (service: AddOnService): string => service.globalServiceId || service.name

/** Example: 1808-1619-EVN1729-8 (same pattern as ticket numbers, EVN prefix) */
export function generateEventRequestNumber(): string {
  const now = new Date()
  const monthDay = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const mid = Math.floor(1000 + Math.random() * 9000)
  const suffix = Math.floor(1000 + Math.random() * 9000)
  const end = Math.floor(1 + Math.random() * 9)
  return `${monthDay}-${mid}-EVN${suffix}-${end}`
}

/**
 * Resolve and validate selected add-on services against a venue's addOnServices allocation.
 */
export function resolveSelectedAddOnServices(
  selected: AddOnService[] | undefined | null,
  venueAddOns: AddOnService[] | null | undefined,
): { ok: true; services: AddOnService[] | null } | { ok: false; error: string } {
  if (selected === undefined || selected === null) {
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

  const venueByKey = new Map(venueServices.map((s) => [getAddOnServiceKey(s), s]))
  const resolved: AddOnService[] = []

  for (const item of selected) {
    if (!item || typeof item.name !== 'string' || !item.name.trim()) {
      return { ok: false, error: 'Each selected service must have a name' }
    }
    const key = getAddOnServiceKey(item)
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

export async function getAllocatedQuantity(
  locId: string,
  globalServiceId: string,
  excludeVenueId?: string,
): Promise<number> {
  const venues = await EventVenue.findAll({
    where: { locationId: locId, isDeleted: false },
    attributes: ['id', 'addOnServices'],
  })

  let total = 0
  for (const venue of venues) {
    if (excludeVenueId && venue.id === excludeVenueId) continue
    const addOns = Array.isArray(venue.addOnServices) ? venue.addOnServices : []
    for (const addon of addOns as AddOnService[]) {
      if (addon.globalServiceId === globalServiceId) {
        total += normalizeServiceQuantity(addon.quantity)
      }
    }
  }
  return total
}

export async function getAllocatedQuantitiesByService(
  locId: string,
  excludeVenueId?: string,
): Promise<Map<string, number>> {
  const venues = await EventVenue.findAll({
    where: { locationId: locId, isDeleted: false },
    attributes: ['id', 'addOnServices'],
  })

  const totals = new Map<string, number>()
  for (const venue of venues) {
    if (excludeVenueId && venue.id === excludeVenueId) continue
    const addOns = Array.isArray(venue.addOnServices) ? venue.addOnServices : []
    for (const addon of addOns as AddOnService[]) {
      if (!addon.globalServiceId) continue
      const current = totals.get(addon.globalServiceId) ?? 0
      totals.set(addon.globalServiceId, current + normalizeServiceQuantity(addon.quantity))
    }
  }
  return totals
}

// ── Upload Helper ─────────────────────────────────────────────────────────────
export function getUploadedFilePath(req: Request, fieldName: string): string | undefined {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined
  const file = files?.[fieldName]?.[0]
  return file ? `/uploads/${file.filename}` : undefined
}

export function getUploadedFilePaths(req: Request, fieldName: string): string[] {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined
  const fieldFiles = files?.[fieldName] || []
  return fieldFiles.map((f) => `/uploads/${f.filename}`)
}

// ── Venue booking availability ────────────────────────────────────────────────
export type VenueBookingConflict = {
  source: 'event' | 'request'
  id: string
  title: string
  startDate: Date
  endDate: Date
}

const BLOCKING_REQUEST_STATUSES = [EventRequestStatus.OPEN, EventRequestStatus.IN_PROGRESS]

export function formatBookingDateTime(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export function formatBookingUnavailableMessage(start: Date | string, end: Date | string): string {
  return `This Venue is booked for (start: ${formatBookingDateTime(start)} / end: ${formatBookingDateTime(end)})`
}

/**
 * Overlap: existing.start < rangeEnd AND existing.end > rangeStart
 */
export async function findVenueBookingConflict(params: {
  venueId: string
  locationId: string
  startDate: Date
  endDate: Date
  excludeEventId?: string
  excludeRequestId?: string
}): Promise<VenueBookingConflict | null> {
  const { venueId, locationId, startDate, endDate, excludeEventId, excludeRequestId } = params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventWhere: any = {
    venueId,
    locationId,
    isDeleted: false,
    isActive: true,
    startDate: { [Op.lt]: endDate },
    endDate: { [Op.gt]: startDate },
  }
  if (excludeEventId) {
    eventWhere.id = { [Op.ne]: excludeEventId }
  }

  const conflictingEvent = await Event.findOne({
    where: eventWhere,
    attributes: ['id', 'title', 'startDate', 'endDate'],
    order: [['startDate', 'ASC']],
  })

  if (conflictingEvent) {
    return {
      source: 'event',
      id: conflictingEvent.id,
      title: conflictingEvent.title,
      startDate: conflictingEvent.startDate,
      endDate: conflictingEvent.endDate,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestWhere: any = {
    venueId,
    locationId,
    isDeleted: false,
    isActive: true,
    status: { [Op.in]: BLOCKING_REQUEST_STATUSES },
    startDate: { [Op.lt]: endDate },
    endDate: { [Op.gt]: startDate },
  }
  if (excludeRequestId) {
    requestWhere.id = { [Op.ne]: excludeRequestId }
  }

  const candidateRequests = await EventRequest.findAll({
    where: requestWhere,
    attributes: ['id', 'title', 'startDate', 'endDate', 'schedule'],
    order: [['startDate', 'ASC']],
  })

  for (const conflictingRequest of candidateRequests) {
    const schedule = Array.isArray(conflictingRequest.schedule) ? conflictingRequest.schedule : null
    if (schedule && schedule.length > 0) {
      for (const slot of schedule) {
        const slotStart = new Date(slot.startDate)
        const slotEnd = new Date(slot.endDate)
        if (Number.isNaN(slotStart.getTime()) || Number.isNaN(slotEnd.getTime())) continue
        if (slotStart < endDate && slotEnd > startDate) {
          return {
            source: 'request',
            id: conflictingRequest.id,
            title: conflictingRequest.title,
            startDate: slotStart,
            endDate: slotEnd,
          }
        }
      }
      continue
    }

    return {
      source: 'request',
      id: conflictingRequest.id,
      title: conflictingRequest.title,
      startDate: conflictingRequest.startDate,
      endDate: conflictingRequest.endDate,
    }
  }

  return null
}

export async function findFirstVenueBookingConflictForRanges(params: {
  venueId: string
  locationId: string
  ranges: Array<{ startDate: Date; endDate: Date }>
  excludeEventId?: string
  excludeRequestId?: string
}): Promise<{ conflict: VenueBookingConflict; range: { startDate: Date; endDate: Date } } | null> {
  for (const range of params.ranges) {
    const conflict = await findVenueBookingConflict({
      venueId: params.venueId,
      locationId: params.locationId,
      startDate: range.startDate,
      endDate: range.endDate,
      ...(params.excludeEventId ? { excludeEventId: params.excludeEventId } : {}),
      ...(params.excludeRequestId ? { excludeRequestId: params.excludeRequestId } : {}),
    })
    if (conflict) {
      return { conflict, range }
    }
  }
  return null
}
