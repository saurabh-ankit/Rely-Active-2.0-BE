/** Parse "HH:mm" into minutes from midnight. Returns null if invalid. */
export function parseTimeToMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm || typeof hhmm !== 'string') return null
  const parts = hhmm.trim().split(':')
  if (parts.length !== 2) return null
  const h = Number(parts[0])
  const m = Number(parts[1])
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

function intervalsFor(start: string | null | undefined, end: string | null | undefined): [number, number][] {
  const s = parseTimeToMinutes(start)
  const e = parseTimeToMinutes(end)
  if (s === null || e === null) return []
  return s <= e
    ? [[s, e]]
    : [
        [s, 1440],
        [0, e],
      ]
}

function rangesOverlap(
  aS: string | null | undefined,
  aE: string | null | undefined,
  bS: string | null | undefined,
  bE: string | null | undefined,
): boolean {
  const A = intervalsFor(aS, aE)
  const B = intervalsFor(bS, bE)
  if (A.length === 0 || B.length === 0) return false
  return A.some(([as, ae]) => B.some(([bs, be]) => Math.max(as, bs) < Math.min(ae, be)))
}

/**
 * Check whether two slot ranges overlap.
 * Accepts either "HH:mm - HH:mm" strings or { start, end } objects.
 */
export function doSlotRangesOverlap(
  range1: string | { start?: string | null; end?: string | null },
  range2: string | { start?: string | null; end?: string | null },
): boolean {
  const parseRange = (
    range: string | { start?: string | null; end?: string | null },
  ): { start: string | null; end: string | null } => {
    if (typeof range === 'string') {
      const parts = range.split('-').map((p) => p.trim())
      if (parts.length !== 2) return { start: null, end: null }
      return { start: parts[0] ?? null, end: parts[1] ?? null }
    }
    return { start: range.start ?? null, end: range.end ?? null }
  }

  const a = parseRange(range1)
  const b = parseRange(range2)
  return rangesOverlap(a.start, a.end, b.start, b.end)
}

/** Parse "HH:mm - HH:mm" slot ranges into minutes-from-midnight. */
export const parseSlotTimeRange = (slotTimeRange: string): { startMinutes: number; endMinutes: number } | null => {
  const parts = slotTimeRange.split('-')
  if (parts.length !== 2) return null

  const startStr = parts[0]?.trim()
  const endStr = parts[1]?.trim()
  if (!startStr || !endStr) return null

  const startMinutes = parseTimeToMinutes(startStr)
  const endMinutes = parseTimeToMinutes(endStr)

  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return null
  }

  return { startMinutes, endMinutes }
}

const parseYmd = (date: string): Date | null => {
  const parts = date.split('-').map(Number)
  const y = parts[0]
  const m = parts[1]
  const day = parts[2]
  if (y === undefined || m === undefined || day === undefined) return null
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(day)) return null
  return new Date(Date.UTC(y, m - 1, day))
}

/** Iterate every calendar day in [startDate, endDate] (inclusive). */
export function* eachDay(start: string, end: string): Generator<string> {
  const cur = parseYmd(start)
  const last = parseYmd(end)
  if (!cur || !last) return

  while (cur <= last) {
    const y = cur.getUTCFullYear()
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0')
    const d = String(cur.getUTCDate()).padStart(2, '0')
    yield `${y}-${m}-${d}`
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
}

/** Coerce Express route param to a single string. */
export const asParamString = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] || ''
  return value || ''
}

export const todayYmdLocal = (now = new Date()): string => {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Whether slot "HH:mm - HH:mm" sits inside shift start/end (overnight-aware). */
export function isSlotWithinShift(slotTimeRange: string, shiftStart: string, shiftEnd: string): boolean {
  const parsed = parseSlotTimeRange(slotTimeRange)
  const sStart = parseTimeToMinutes(shiftStart)
  const sEnd = parseTimeToMinutes(shiftEnd)
  if (!parsed || sStart === null || sEnd === null) return false

  const overnight = sEnd <= sStart
  const shiftEndAbs = overnight ? sEnd + 1440 : sEnd
  let slotStartAbs = parsed.startMinutes
  let slotEndAbs = parsed.endMinutes <= parsed.startMinutes ? parsed.endMinutes + 1440 : parsed.endMinutes
  if (overnight && slotStartAbs < sStart) {
    slotStartAbs += 1440
    slotEndAbs += 1440
  }
  return slotStartAbs >= sStart && slotEndAbs <= shiftEndAbs
}

/**
 * True when the window start (HH:mm) has already passed on dateYmd in local time.
 */
export function hasWindowStartPassedOnDate(dateYmd: string, startHHmm: string, now = new Date()): boolean {
  const today = todayYmdLocal(now)
  if (dateYmd < today) return true
  if (dateYmd > today) return false
  const startMin = parseTimeToMinutes(startHHmm)
  if (startMin === null) return false
  const nowMin = now.getHours() * 60 + now.getMinutes()
  return nowMin >= startMin
}

/** Add (or subtract) whole days from a YYYY-MM-DD local calendar date. */
export function addDaysYmd(dateYmd: string, days: number): string {
  const parts = dateYmd.split('-').map(Number)
  const y = parts[0]
  const m = parts[1]
  const d = parts[2]
  if (y === undefined || m === undefined || d === undefined) return dateYmd
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return todayYmdLocal(dt)
}

export type TimeBasedShiftStatus = 'upcoming' | 'on_duty' | 'completed'

/**
 * Derive upcoming / on_duty / completed from roster date + duty window (local time).
 * Overnight windows (end <= start) spill into the next calendar day.
 */
export function resolveTimeBasedShiftStatus(
  dateYmd: string,
  startHHmm: string,
  endHHmm: string,
  now = new Date(),
): TimeBasedShiftStatus {
  const today = todayYmdLocal(now)
  const startMin = parseTimeToMinutes(startHHmm)
  const endMin = parseTimeToMinutes(endHHmm)

  if (startMin === null || endMin === null) {
    if (dateYmd < today) return 'completed'
    return 'upcoming'
  }

  const overnight = endMin <= startMin
  const endDateYmd = overnight ? addDaysYmd(dateYmd, 1) : dateYmd
  const nowMin = now.getHours() * 60 + now.getMinutes()

  if (today < dateYmd) return 'upcoming'
  if (today > endDateYmd) return 'completed'

  if (!overnight) {
    if (nowMin < startMin) return 'upcoming'
    if (nowMin >= endMin) return 'completed'
    return 'on_duty'
  }

  // Overnight: still on start day after start → on_duty; on end day until end → on_duty
  if (today === dateYmd) {
    if (nowMin < startMin) return 'upcoming'
    return 'on_duty'
  }
  if (nowMin >= endMin) return 'completed'
  return 'on_duty'
}

/**
 * Advance only time-driven statuses (upcoming / on_duty). Leaves covered, day_off, absent alone.
 */
export function resolveLifecycleRosterStatus(
  currentStatus: string,
  dateYmd: string,
  startHHmm: string | null | undefined,
  endHHmm: string | null | undefined,
  now = new Date(),
): string {
  if (currentStatus !== 'upcoming' && currentStatus !== 'on_duty') return currentStatus
  if (!startHHmm || !endHHmm) {
    if (dateYmd < todayYmdLocal(now)) return 'completed'
    return currentStatus
  }
  return resolveTimeBasedShiftStatus(dateYmd, startHHmm, endHHmm, now)
}
