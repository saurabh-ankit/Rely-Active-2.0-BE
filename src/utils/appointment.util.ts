import { parseTimeToMinutes } from './roster.util.js'

const minutesToHHmm = (totalMinutes: number): string => {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Generate appointment slots for a shift window.
 * Prefer numberOfSlots (equal split); else walk by slotDuration (default 60).
 */
export function generateAppointmentSlots(
  startTime: string,
  endTime: string,
  numberOfSlots?: number | null,
  slotDuration?: number | null,
): string[] {
  const start = parseTimeToMinutes(startTime)
  const end = parseTimeToMinutes(endTime)
  if (start === null || end === null) return []

  const overnight = end <= start
  const absoluteEnd = overnight ? end + 1440 : end
  const total = absoluteEnd - start
  if (total < 1) return []

  if (numberOfSlots && numberOfSlots > 0) {
    if (total < numberOfSlots) return []
    const duration = Math.floor(total / numberOfSlots)
    if (duration < 1) return []

    const slots: string[] = []
    for (let i = 0; i < numberOfSlots; i++) {
      const contiguousStart = start + i * duration
      const contiguousEnd = i === numberOfSlots - 1 ? absoluteEnd : start + (i + 1) * duration
      const slotStartMin = i === 0 ? contiguousStart : contiguousStart + 1
      slots.push(`${minutesToHHmm(slotStartMin)} - ${minutesToHHmm(contiguousEnd)}`)
    }
    return slots
  }

  const durationMinutes = slotDuration && slotDuration > 0 ? slotDuration : 60
  const slots: string[] = []
  for (let cursor = start; cursor + durationMinutes <= absoluteEnd; cursor += durationMinutes) {
    slots.push(`${minutesToHHmm(cursor)} - ${minutesToHHmm(cursor + durationMinutes)}`)
  }
  return slots
}

/** Parse assignment slotTimeRange "HH:mm - HH:mm" into start/end, or fall back to shift times. */
export function resolveEffectiveWindow(
  assignmentSlotTimeRange: string | null | undefined,
  shiftStart: string | null | undefined,
  shiftEnd: string | null | undefined,
): { startTime: string; endTime: string } | null {
  if (assignmentSlotTimeRange) {
    const parts = assignmentSlotTimeRange.split('-').map((p) => p.trim())
    if (parts.length === 2 && parts[0] && parts[1]) {
      return { startTime: parts[0], endTime: parts[1] }
    }
  }
  if (shiftStart && shiftEnd) {
    return { startTime: shiftStart, endTime: shiftEnd }
  }
  return null
}

/** Local YYYY-MM-DD for a Date. */
export function toLocalDateStr(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * True when a slot's start time on appointmentDate is already in the past (local time).
 * Past calendar days: all slots past. Future days: none past.
 */
export function isSlotInPast(appointmentDate: string, slotTimeRange: string, now = new Date()): boolean {
  const dateOnly = String(appointmentDate || '').split('T')[0] || ''
  if (!dateOnly) return true

  const today = toLocalDateStr(now)
  if (dateOnly < today) return true
  if (dateOnly > today) return false

  const startStr = slotTimeRange.split('-').map((p) => p.trim())[0]
  const startMinutes = parseTimeToMinutes(startStr)
  if (startMinutes === null) return true

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  return startMinutes <= nowMinutes
}

/** Slot is bookable when not already taken and not in the past. */
export function isSlotBookable(
  appointmentDate: string,
  slotTimeRange: string,
  isBooked: boolean,
  now = new Date(),
): boolean {
  if (isBooked) return false
  return !isSlotInPast(appointmentDate, slotTimeRange, now)
}
