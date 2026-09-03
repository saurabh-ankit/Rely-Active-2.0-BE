import type { Request } from 'express'
import { FrequencyType } from '../enums/event.enum.js'
import { EventVenue } from '../models/index.js'
import type { AddOnService } from '../models/eventVenue.model.js'

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
