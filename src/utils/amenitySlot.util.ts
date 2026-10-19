const MINUTES_PER_DAY = 24 * 60

export const SLOT_STATUSES = {
  AVAILABLE: 'AVAILABLE',
  PARTIALLY_BOOKED: 'PARTIALLY_BOOKED',
  BOOKED: 'BOOKED',
  BLOCKED: 'BLOCKED',
  PAST: 'PAST',
  LEGACY_BOOKED: 'LEGACY_BOOKED',
} as const

export type SlotStatus = (typeof SLOT_STATUSES)[keyof typeof SLOT_STATUSES]

export interface NormalizedSlotConfig {
  openMinutes: number
  closeMinutes: number
  durationMin: number
  capacity: number
  daysOfWeek: number[]
}

export const toYmdLocal = (date = new Date()): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const dateToDayOfWeekMon0 = (date: Date): number => {
  const day = date.getDay()
  return day === 0 ? 6 : day - 1
}

export const ymdToDayOfWeekMon0 = (ymd: string): number | null => {
  const [year, month, day] = ymd.split('-').map(Number)
  if (!year || !month || !day) return null
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return null
  return dateToDayOfWeekMon0(date)
}

export const normalizeDaysOfWeek = (days: unknown): number[] => {
  if (!Array.isArray(days)) return []
  const normalized = days.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  return Array.from(new Set(normalized)).sort((a, b) => a - b)
}

export const generateSlotStartMinutes = (openMinutes: number, closeMinutes: number, durationMin: number): number[] => {
  if (!Number.isInteger(openMinutes) || !Number.isInteger(closeMinutes) || !Number.isInteger(durationMin)) return []
  if (openMinutes < 0 || closeMinutes > MINUTES_PER_DAY || durationMin <= 0 || closeMinutes <= openMinutes) return []

  const slots: number[] = []
  for (let cursor = openMinutes; cursor + durationMin <= closeMinutes; cursor += durationMin) {
    slots.push(cursor)
  }
  return slots
}

export const classifySlotPeriod = (startMinutes: number): 'MORNING' | 'AFTERNOON' | 'EVENING' => {
  if (startMinutes < 12 * 60) return 'MORNING'
  if (startMinutes < 17 * 60) return 'AFTERNOON'
  return 'EVENING'
}

export const isPastSlot = (dateYmd: string, startMinutes: number, now = new Date()): boolean => {
  const today = toYmdLocal(now)
  if (dateYmd < today) return true
  if (dateYmd > today) return false
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  return startMinutes <= nowMinutes
}

export const formatMinutesToAmPm = (minutes: number): string => {
  const safe = Math.max(0, Math.min(minutes, MINUTES_PER_DAY))
  const hour = Math.floor(safe / 60)
  const minute = safe % 60
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`
}
