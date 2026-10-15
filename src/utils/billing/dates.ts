/**
 * Date-only helpers for billing. All values are 'YYYY-MM-DD' strings handled in UTC
 * so month boundaries never shift with the server time zone.
 */

const DAY_MS = 24 * 60 * 60 * 1000

export const parseDay = (day: string): Date => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
}

export const formatDay = (date: Date): string => date.toISOString().slice(0, 10)

/** Normalises a DATE / DATEONLY / ISO value to 'YYYY-MM-DD' (null stays null). */
export const toDay = (value: Date | string | null | undefined): string | null => {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : formatDay(value)
  const str = String(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10)
  const parsed = new Date(str)
  return Number.isNaN(parsed.getTime()) ? null : formatDay(parsed)
}

/** Billing days follow local (IST) time; DATETIME columns are stored in UTC. */
const LOCAL_OFFSET_MIN = Number(process.env.BILLING_TZ_OFFSET_MINUTES ?? 330)

/** Local calendar day of a DATETIME value. */
export const localDay = (value: Date | string | null | undefined): string | null => {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return formatDay(new Date(date.getTime() + LOCAL_OFFSET_MIN * 60 * 1000))
}

/** UTC instants bounding the local days [from, to], for querying DATETIME columns. */
export const localDayBounds = (from: string, to: string): [Date, Date] => [
  new Date(parseDay(from).getTime() - LOCAL_OFFSET_MIN * 60 * 1000),
  new Date(parseDay(to).getTime() + DAY_MS - 1 - LOCAL_OFFSET_MIN * 60 * 1000),
]

export const todayDay = (): string => localDay(new Date()) as string

export const addDays = (day: string, days: number): string =>
  formatDay(new Date(parseDay(day).getTime() + days * DAY_MS))

export const minDay = (a: string, b: string): string => (a < b ? a : b)
export const maxDay = (a: string, b: string): string => (a > b ? a : b)

/** Inclusive number of days from `from` to `to` (0 when `to` is before `from`). */
export const daysInclusive = (from: string, to: string): number =>
  to < from ? 0 : Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / DAY_MS) + 1

export const startOfMonth = (day: string): string => `${day.slice(0, 7)}-01`

export const endOfMonth = (day: string): string => {
  const d = parseDay(day)
  return formatDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)))
}

export const daysInMonth = (day: string): number => daysInclusive(startOfMonth(day), endOfMonth(day))

/** True when [from, to] is exactly one calendar month. */
export const isFullCalendarMonth = (from: string, to: string): boolean =>
  from === startOfMonth(from) && to === endOfMonth(from)

/** Intersection of two inclusive ranges (null bounds are open), or null when they don't overlap. */
export const overlapRange = (
  aFrom: string,
  aTo: string,
  bFrom: string | null,
  bTo: string | null,
): { from: string; to: string } | null => {
  const from = bFrom ? maxDay(aFrom, bFrom) : aFrom
  const to = bTo ? minDay(aTo, bTo) : aTo
  return from <= to ? { from, to } : null
}

/**
 * Cost of a monthly charge over [from, to], prorated per calendar month by days
 * (a full calendar month costs exactly `monthlyPrice`, whatever its length).
 */
export const prorateMonthly = (monthlyPrice: number, from: string, to: string): number => {
  let total = 0
  let cursor = from
  while (cursor <= to) {
    const monthEnd = endOfMonth(cursor)
    const segmentEnd = minDay(monthEnd, to)
    total += (monthlyPrice * daysInclusive(cursor, segmentEnd)) / daysInMonth(cursor)
    cursor = addDays(monthEnd, 1)
  }
  return roundMoney(total)
}

export const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100

/** Indian financial year label, e.g. 2026-27 for any date from 1 Apr 2026 to 31 Mar 2027. */
export const financialYear = (day: string = todayDay()): string => {
  const year = Number(day.slice(0, 4))
  const month = Number(day.slice(5, 7))
  const start = month >= 4 ? year : year - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}
