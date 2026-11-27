import { QueryTypes } from 'sequelize'
import sequelize from '../config/db/index.js'
import type { PermissionSet } from './permission.service.js'
import { todayYmdLocal } from '../utils/roster.util.js'

/**
 * Read-only "Task Calendar": every dated activity at one property, from every module,
 * mapped to one item shape.
 *
 * Dates are the property's (India) calendar days. DATETIME columns written by Sequelize
 * hold UTC and are shifted to IST; DATE columns and the date-only asset columns (stored
 * as midnight) are used as stored.
 *
 * High-volume categories (care tasks, shifts, visitor entries, meal orders) return one
 * count per day for multi-day ranges and their full list only for a single day.
 */

export const CALENDAR_CATEGORIES = [
  { key: 'events', label: 'Events' },
  { key: 'appointments', label: 'Doctor Appointments' },
  { key: 'careTasks', label: 'Care Tasks' },
  { key: 'shifts', label: 'Staff Shifts' },
  { key: 'amenities', label: 'Amenity Bookings' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'assets', label: 'Asset Maintenance' },
  { key: 'visitors', label: 'Visitors' },
  { key: 'food', label: 'Meal Orders' },
  { key: 'feedback', label: 'Feedback Forms' },
] as const

export type CalendarCategory = (typeof CALENDAR_CATEGORIES)[number]['key']

export interface CalendarDetail {
  label: string
  value: string
}

export interface CalendarItem {
  id: string
  category: CalendarCategory
  /** What kind of activity within the category, e.g. "Service due". */
  kind: string
  title: string
  subtitle: string | null
  /** First and last day (YYYY-MM-DD, inclusive). Equal for single-day items. */
  startDate: string
  endDate: string
  /** HH:mm (24h) on startDate / endDate; null = all day. */
  startTime: string | null
  endTime: string | null
  status: string | null
  details: CalendarDetail[]
  /** In-app route of the module that owns the record. */
  link: string | null
}

export interface CalendarDaySummary {
  category: CalendarCategory
  /** Sub-group inside the category (e.g. "Visitor entries" next to listed pre-approved passes). */
  label: string
  date: string
  total: number
  breakdown: Record<string, number>
  link: string | null
}

export interface CalendarResult {
  from: string
  to: string
  today: string
  /** True when high-volume categories were returned as full items (single-day range). */
  fullDetail: boolean
  categories: Array<{ key: CalendarCategory; label: string }>
  items: CalendarItem[]
  summaries: CalendarDaySummary[]
}

/** Category → resource keys; the user needs view on at least one. null = no module permission exists. */
const CATEGORY_RESOURCES: Record<CalendarCategory, string[] | null> = {
  events: ['EVENTS.EVENTS', 'EVENTS.REQUESTS'],
  appointments: ['MEDICAL.APPOINTMENTS'],
  careTasks: ['MEDICAL.CARE_TASKS'],
  shifts: ['ROSTER.ROSTER'],
  amenities: null,
  tickets: ['TICKETS'],
  assets: ['ASSET.MAINTENANCE', 'ASSET.COMPLIANCE'],
  visitors: ['GNS.PREAPPROVED', 'GNS.ENTRY_LOGS'],
  food: ['FNB.ORDERS'],
  feedback: ['SETTINGS.FEEDBACK'],
}

export const MAX_RANGE_DAYS = 62

// ── Date & time helpers ───────────────────────────────────────────────────────

const IST = "'+05:30'"
const UTC = "'+00:00'"
/** SQL: a UTC DATETIME column as an IST day / time. */
const istDay = (col: string) => `DATE_FORMAT(CONVERT_TZ(${col}, ${UTC}, ${IST}), '%Y-%m-%d')`
const istTime = (col: string) => `DATE_FORMAT(CONVERT_TZ(${col}, ${UTC}, ${IST}), '%H:%i')`
/** SQL: a DATE / date-only column as stored. */
const plainDay = (col: string) => `DATE_FORMAT(${col}, '%Y-%m-%d')`

const YMD = /^\d{4}-\d{2}-\d{2}$/
export const isYmd = (v: unknown): v is string =>
  typeof v === 'string' && YMD.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))

export const addDays = (ymd: string, days: number): string => {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

/** UTC 'YYYY-MM-DD HH:MM:SS' for IST midnight at the start of `ymd`. */
const istMidnightUtc = (ymd: string): string =>
  new Date(Date.parse(`${ymd}T00:00:00+05:30`)).toISOString().slice(0, 19).replace('T', ' ')

/** "11:00 AM" / "16:30" → "11:00" / "16:30"; anything else → null. */
export const toHHmm = (raw: string | null | undefined): string | null => {
  if (!raw) return null
  const m = String(raw)
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2])
  const ampm = m[3]?.toUpperCase()
  if (ampm === 'PM' && h < 12) h += 12
  if (ampm === 'AM' && h === 12) h = 0
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** "04:00 PM - 04:30 PM" → ["16:00", "16:30"]. */
const splitRange = (raw: string | null | undefined): [string | null, string | null] => {
  if (!raw) return [null, null]
  const [a, b] = String(raw).split('-')
  return [toHHmm(a), toHHmm(b)]
}

const minutesToHHmm = (m: number | null | undefined): string | null => {
  if (m === null || m === undefined || Number.isNaN(Number(m))) return null
  const total = ((Number(m) % 1440) + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const fullName = (first?: string | null, last?: string | null): string | null => {
  const n = [first, last]
    .filter((p) => p && String(p).trim())
    .join(' ')
    .trim()
  return n || null
}

/** Readable status: "IN_PROGRESS" / "delivering_to_room" → "In progress" / "Delivering to room". */
export const prettyStatus = (s: string | null | undefined): string | null => {
  if (!s) return null
  const text = String(s).replace(/_/g, ' ').toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const details = (pairs: Array<[string, unknown]>): CalendarDetail[] =>
  pairs
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    .map(([label, v]) => ({ label, value: String(v) }))

// ── Query context ─────────────────────────────────────────────────────────────

interface Ctx {
  loc: string
  from: string
  to: string
  /** UTC bounds of the IST range: [fromUtc, toUtcExcl). */
  fromUtc: string
  toUtcExcl: string
  /** Day after `to`, for date-only columns. */
  toExcl: string
  today: string
  fullDetail: boolean
  perms: PermissionSet
}

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const select = (sql: string, ctx: Ctx, extra: Record<string, unknown> = {}) =>
  sequelize.query<Row>(sql, {
    replacements: {
      loc: ctx.loc,
      from: ctx.from,
      to: ctx.to,
      toExcl: ctx.toExcl,
      fromUtc: ctx.fromUtc,
      toUtcExcl: ctx.toUtcExcl,
      ...extra,
    },
    type: QueryTypes.SELECT,
  })

interface Part {
  items: CalendarItem[]
  summaries: CalendarDaySummary[]
}
const part = (items: CalendarItem[] = [], summaries: CalendarDaySummary[] = []): Part => ({ items, summaries })

/** Count rows per day into summaries; `groupOf` picks the breakdown bucket. */
const summarize = (
  rows: Row[],
  category: CalendarCategory,
  label: string,
  link: string | null,
  groupOf: (r: Row) => string,
): CalendarDaySummary[] => {
  const byDay = new Map<string, CalendarDaySummary>()
  for (const r of rows) {
    const date = String(r.day)
    let s = byDay.get(date)
    if (!s) {
      s = { category, label, date, total: 0, breakdown: {}, link }
      byDay.set(date, s)
    }
    s.total += 1
    const g = groupOf(r)
    s.breakdown[g] = (s.breakdown[g] || 0) + 1
  }
  return [...byDay.values()]
}

// ── Events ────────────────────────────────────────────────────────────────────

async function fetchEvents(ctx: Ctx): Promise<Part> {
  const items: CalendarItem[] = []

  if (ctx.perms.can('EVENTS.EVENTS', 'view')) {
    const rows = await select(
      `SELECT e.id, e.title, e.eventType, e.frequencyType, e.occupancy, e.maxCapacity, e.entryFee,
              ${istDay('e.startDate')} AS sDay, ${istTime('e.startDate')} AS sTime,
              ${istDay('e.endDate')} AS eDay, ${istTime('e.endDate')} AS eTime,
              v.name AS venue,
              EXISTS (SELECT 1 FROM event_requests er WHERE er.confirmedEventId = e.id) AS fromRequest,
              (SELECT COUNT(*) FROM event_registrations reg
                 WHERE reg.eventId = e.id AND reg.isDeleted = 0 AND reg.status IN ('CONFIRMED','ATTENDED')) AS registrations
         FROM events e
         LEFT JOIN event_venues v ON v.id = e.venueId
        WHERE e.locationId = :loc AND e.isDeleted = 0
          AND e.startDate < :toUtcExcl AND e.endDate >= :fromUtc`,
      ctx,
    )
    for (const r of rows) {
      const kind = Number(r.fromRequest)
        ? 'Resident event'
        : r.eventType === 'regular'
          ? 'Regular event'
          : 'Special event'
      items.push({
        id: `event:${r.id}`,
        category: 'events',
        kind,
        title: r.title,
        subtitle: r.venue || null,
        startDate: r.sDay,
        endDate: r.eDay < r.sDay ? r.sDay : r.eDay,
        startTime: r.sTime,
        endTime: r.eTime,
        status: null,
        details: details([
          ['Venue', r.venue],
          ['Repeats', r.frequencyType && r.frequencyType !== 'once' ? prettyStatus(r.frequencyType) : null],
          ['Registrations', Number(r.registrations) || null],
          ['Capacity', r.maxCapacity ?? r.occupancy],
          ['Entry fee', r.entryFee ? `₹${Number(r.entryFee)}` : null],
        ]),
        link: '/admin/events?tab=calendar',
      })
    }
  }

  if (ctx.perms.can('EVENTS.REQUESTS', 'view')) {
    // Requests still being worked on (confirmed ones already appear as events), and their meetings.
    const rows = await select(
      `SELECT er.id, er.title, er.status, er.requestNumber, er.occupancy,
              ${istDay('er.startDate')} AS sDay, ${istTime('er.startDate')} AS sTime,
              ${istDay('er.endDate')} AS eDay, ${istTime('er.endDate')} AS eTime,
              er.meetingScheduledAt IS NOT NULL
                AND er.meetingScheduledAt >= :fromUtc AND er.meetingScheduledAt < :toUtcExcl AS meetingInRange,
              ${istDay('er.meetingScheduledAt')} AS mDay, ${istTime('er.meetingScheduledAt')} AS mTime,
              er.startDate < :toUtcExcl AND er.endDate >= :fromUtc AS requestInRange,
              r.firstName, r.lastName, v.name AS venue
         FROM event_requests er
         LEFT JOIN residents r ON r.id = er.residentId
         LEFT JOIN event_venues v ON v.id = er.venueId
        WHERE er.locationId = :loc AND er.isDeleted = 0
          AND er.status IN ('OPEN','IN_PROGRESS') AND er.confirmedEventId IS NULL
          AND ((er.startDate < :toUtcExcl AND er.endDate >= :fromUtc)
               OR (er.meetingScheduledAt >= :fromUtc AND er.meetingScheduledAt < :toUtcExcl))`,
      ctx,
    )
    for (const r of rows) {
      const resident = fullName(r.firstName, r.lastName)
      const base = details([
        ['Request no.', r.requestNumber],
        ['Requested by', resident],
        ['Venue', r.venue],
        ['Guests', r.occupancy],
      ])
      if (Number(r.requestInRange)) {
        items.push({
          id: `eventRequest:${r.id}`,
          category: 'events',
          kind: 'Event request',
          title: r.title,
          subtitle: resident,
          startDate: r.sDay,
          endDate: r.eDay < r.sDay ? r.sDay : r.eDay,
          startTime: r.sTime,
          endTime: r.eTime,
          status: prettyStatus(r.status),
          details: base,
          link: '/admin/events?tab=calendar',
        })
      }
      if (Number(r.meetingInRange)) {
        items.push({
          id: `eventRequestMeeting:${r.id}`,
          category: 'events',
          kind: 'Request meeting',
          title: `Meeting: ${r.title}`,
          subtitle: resident,
          startDate: r.mDay,
          endDate: r.mDay,
          startTime: r.mTime,
          endTime: null,
          status: prettyStatus(r.status),
          details: base,
          link: '/admin/events?tab=calendar',
        })
      }
    }
  }
  return part(items)
}

// ── Doctor appointments ───────────────────────────────────────────────────────

async function fetchAppointments(ctx: Ctx): Promise<Part> {
  const rows = await select(
    `SELECT da.id, da.status, da.slotTimeRange, da.notes, da.fee, da.shiftEmployeeDateId,
            ${plainDay('da.appointmentDate')} AS day,
            r.firstName, r.lastName, fm.firstName AS fmFirst, fm.lastName AS fmLast,
            doc.firstName AS docFirst, doc.lastName AS docLast
       FROM doctor_appointments da
       LEFT JOIN residents r ON r.id = da.residentId
       LEFT JOIN resident_family_members fm ON fm.id = da.familyMemberId
       LEFT JOIN user_details doc ON doc.userId = da.doctorId
      WHERE da.locationId = :loc AND da.isDeleted = 0
        AND da.appointmentDate >= :from AND da.appointmentDate <= :to`,
    ctx,
  )
  return part(
    rows.map((r) => {
      const patient = fullName(r.fmFirst, r.fmLast) || fullName(r.firstName, r.lastName) || 'Resident'
      const doctor = fullName(r.docFirst, r.docLast)
      const [startTime, endTime] = splitRange(r.slotTimeRange)
      return {
        id: `appointment:${r.id}`,
        category: 'appointments' as const,
        kind: 'Doctor appointment',
        title: doctor ? `${patient} with Dr. ${doctor}` : patient,
        subtitle: r.slotTimeRange || null,
        startDate: r.day,
        endDate: r.day,
        startTime,
        endTime,
        status: prettyStatus(r.status),
        details: details([
          ['Patient', patient],
          ['Doctor', doctor ? `Dr. ${doctor}` : null],
          ['Slot', r.slotTimeRange],
          ['Fee', r.fee ? `₹${Number(r.fee)}` : null],
          ['Notes', r.notes],
        ]),
        link: r.shiftEmployeeDateId
          ? `/admin/medical/appointments/${r.shiftEmployeeDateId}`
          : '/admin/medical?section=appointments',
      }
    }),
  )
}

// ── Care tasks (daily slots, expanded per day) ────────────────────────────────

async function fetchCareTasks(ctx: Ctx): Promise<Part> {
  const rows = await select(
    `SELECT cta.id, cta.time, cta.status, cta.isStopped, cta.customInstructions, cta.source,
            ${plainDay('cta.startDate')} AS sDay, ${plainDay('cta.endDate')} AS eDay,
            ${istDay('cta.stoppedAt')} AS stoppedDay,
            ${istDay('cta.completedAt')} AS legacyDoneDay,
            ${plainDay('ps.endDate')} AS psEnd, ps.status AS psStatus, ps.isDeleted AS psDeleted,
            ct.careTaskName, r.firstName, r.lastName, fm.firstName AS fmFirst, fm.lastName AS fmLast,
            nurse.firstName AS nurseFirst, nurse.lastName AS nurseLast, pu.unit_number AS unit
       FROM care_task_assignments cta
       JOIN residents r ON r.id = cta.residentId AND r.isDeleted = 0 AND r.isResiding = 1
       LEFT JOIN resident_family_members fm ON fm.id = cta.familyMemberId
       LEFT JOIN care_tasks ct ON ct.id = cta.taskId
       LEFT JOIN package_subscriptions ps ON ps.id = cta.packageSubscriptionId
       LEFT JOIN user_details nurse ON nurse.userId = cta.nurseId
       LEFT JOIN property_units pu ON pu.id = r.unitId
      WHERE cta.isDeleted = 0
        AND (cta.propertyId = :loc OR r.locId = :loc)
        AND cta.startDate <= :to
        AND (cta.endDate IS NULL OR cta.endDate >= :from)
        AND ((cta.status = 'ACTIVE' AND cta.isStopped = 0) OR cta.stoppedAt IS NOT NULL)`,
    ctx,
  )
  if (!rows.length) return part()

  const ids = rows.map((r) => r.id)
  const done = await select(
    `SELECT c.residentCareTaskAssignmentId AS aid, c.status, ${istDay('c.completedAt')} AS day,
            ${istTime('c.completedAt')} AS at, u.firstName, u.lastName
       FROM resident_care_task_completions c
       LEFT JOIN user_details u ON u.userId = c.completedBy
      WHERE c.isDeleted = 0 AND c.residentCareTaskAssignmentId IN (:ids)
        AND c.completedAt >= :fromUtc AND c.completedAt < :toUtcExcl`,
    ctx,
    { ids },
  )
  const doneMap = new Map<string, Row>()
  for (const d of done) doneMap.set(`${d.aid}|${d.day}`, d)

  // One occurrence per assignment per day it is active.
  const occurrences: Row[] = []
  for (const r of rows) {
    // A package task lives only while its package subscription does.
    if (r.source === 'PACKAGE' && (r.psStatus !== 'ACTIVE' || Number(r.psDeleted))) continue
    let last = ctx.to
    if (r.eDay && r.eDay < last) last = r.eDay
    if (r.psEnd && r.psEnd < last) last = r.psEnd
    if (r.stoppedDay) {
      const before = addDays(r.stoppedDay, -1)
      if (before < last) last = before
    } else if (r.status !== 'ACTIVE' || Number(r.isStopped)) continue
    for (let day = r.sDay > ctx.from ? r.sDay : ctx.from; day <= last; day = addDays(day, 1)) {
      const completion = doneMap.get(`${r.id}|${day}`)
      let status: string
      if (completion) status = completion.status === 'CANCELLED' ? 'Cancelled' : 'Completed'
      else if (r.legacyDoneDay === day) status = 'Completed'
      else if (day < ctx.today) status = 'Missed'
      else if (day === ctx.today) status = 'Pending'
      else status = 'Scheduled'
      occurrences.push({ ...r, day, dayStatus: status, completion })
    }
  }

  const link = '/admin/medical?section=care&tab=assigned'
  if (!ctx.fullDetail) {
    return part(
      [],
      summarize(occurrences, 'careTasks', 'Care tasks', link, (o) => o.dayStatus),
    )
  }
  return part(
    occurrences.map((o) => {
      const resident = fullName(o.fmFirst, o.fmLast) || fullName(o.firstName, o.lastName) || 'Resident'
      const doneBy = o.completion ? fullName(o.completion.firstName, o.completion.lastName) : null
      return {
        id: `careTask:${o.id}:${o.day}`,
        category: 'careTasks' as const,
        kind: o.source === 'PACKAGE' ? 'Package care task' : 'Add-on care task',
        title: `${o.careTaskName || 'Care task'} · ${resident}`,
        subtitle: o.unit ? `Flat ${o.unit}` : null,
        startDate: o.day,
        endDate: o.day,
        startTime: toHHmm(o.time),
        endTime: null,
        status: o.dayStatus,
        details: details([
          ['Resident', resident],
          ['Flat', o.unit],
          ['Time', o.time],
          ['Nurse', fullName(o.nurseFirst, o.nurseLast)],
          ['Done by', doneBy ? `${doneBy}${o.completion?.at ? ` at ${o.completion.at}` : ''}` : null],
          ['Instructions', o.customInstructions],
        ]),
        link,
      }
    }),
  )
}

// ── Staff shifts ──────────────────────────────────────────────────────────────

async function fetchShifts(ctx: Ctx): Promise<Part> {
  const rows = await select(
    `SELECT sd.id, sd.status, sd.leaveType, sd.notes, ${plainDay('sd.date')} AS day,
            s.name AS shiftName, s.startTime, s.endTime, sa.slotTimeRange, sa.employeeId,
            emp.firstName, emp.lastName, cov.firstName AS covFirst, cov.lastName AS covLast,
            ar.areaName AS area
       FROM shift_dates sd
       JOIN shift_assignments sa ON sa.id = sd.employeeShiftAssignmentId
       LEFT JOIN shifts s ON s.id = sa.shiftId
       LEFT JOIN user_details emp ON emp.userId = sa.employeeId
       LEFT JOIN user_details cov ON cov.userId = sd.coveredByEmployeeId
       LEFT JOIN shift_areas ar ON ar.id = COALESCE(sd.areaId, sa.areaId)
      WHERE sd.locationId = :loc AND sd.isDeleted = 0 AND sa.isDeleted = 0
        AND sd.date >= :from AND sd.date <= :to`,
    ctx,
  )
  const link = '/admin/shift-roster-management'
  if (!ctx.fullDetail) {
    return part(
      [],
      summarize(rows, 'shifts', 'Staff on roster', link, (r) => prettyStatus(r.status) || 'Scheduled'),
    )
  }
  return part(
    rows.map((r) => {
      const [slotStart, slotEnd] = splitRange(r.slotTimeRange)
      const employee = fullName(r.firstName, r.lastName) || 'Employee'
      return {
        id: `shift:${r.id}`,
        category: 'shifts' as const,
        kind: 'Staff shift',
        title: employee,
        subtitle: [r.shiftName, r.area].filter(Boolean).join(' · ') || null,
        startDate: r.day,
        endDate: r.day,
        startTime: slotStart || toHHmm(r.startTime),
        endTime: slotEnd || toHHmm(r.endTime),
        status: prettyStatus(r.status),
        details: details([
          ['Shift', r.shiftName],
          ['Timing', r.startTime && r.endTime ? `${r.startTime} – ${r.endTime}` : null],
          ['Slot', r.slotTimeRange],
          ['Area', r.area],
          ['Covered by', fullName(r.covFirst, r.covLast)],
          ['Leave', prettyStatus(r.leaveType)],
          ['Notes', r.notes],
        ]),
        link,
      }
    }),
  )
}

// ── Amenity bookings ──────────────────────────────────────────────────────────

async function fetchAmenities(ctx: Ctx): Promise<Part> {
  const rows = await select(
    `SELECT b.id, b.status, b.startMinutes, b.endMinutes, b.unitCount, b.chargeAmount, b.notes,
            ${plainDay('b.date')} AS sDay, ${plainDay('COALESCE(b.endDate, b.date)')} AS eDay,
            a.name AS amenity, r.firstName, r.lastName, fm.firstName AS fmFirst, fm.lastName AS fmLast,
            pu.unit_number AS unit
       FROM amenity_slot_bookings b
       JOIN amenity_slot_configs c ON c.id = b.slotConfigId
       JOIN property_amenities pa ON pa.id = c.propertyAmenityId
       LEFT JOIN amenities a ON a.id = pa.amenityId
       LEFT JOIN residents r ON r.id = b.residentId
       LEFT JOIN resident_family_members fm ON fm.id = b.familyMemberId
       LEFT JOIN property_units pu ON pu.id = r.unitId
      WHERE pa.propertyId = :loc AND b.isDeleted = 0
        AND b.date <= :to AND COALESCE(b.endDate, b.date) >= :from`,
    ctx,
  )
  return part(
    rows.map((r) => {
      const who = fullName(r.fmFirst, r.fmLast) || fullName(r.firstName, r.lastName)
      const multiDay = r.eDay && r.eDay !== r.sDay
      return {
        id: `amenity:${r.id}`,
        category: 'amenities' as const,
        kind: 'Amenity booking',
        title: `${r.amenity || 'Amenity'}${who ? ` · ${who}` : ''}`,
        subtitle: r.unit ? `Flat ${r.unit}` : null,
        startDate: r.sDay,
        endDate: r.eDay || r.sDay,
        startTime: multiDay ? null : minutesToHHmm(r.startMinutes),
        endTime: multiDay ? null : minutesToHHmm(r.endMinutes),
        status: prettyStatus(r.status),
        details: details([
          ['Amenity', r.amenity],
          ['Booked by', who],
          ['Flat', r.unit],
          ['Units', r.unitCount],
          ['Charge', r.chargeAmount ? `₹${Number(r.chargeAmount)}` : null],
          ['Notes', r.notes],
        ]),
        link: '/admin/amenities',
      }
    }),
  )
}

// ── Tickets (on the day they were raised) ─────────────────────────────────────

async function fetchTickets(ctx: Ctx): Promise<Part> {
  const rows = await select(
    `SELECT t.id, t.ticketNumber, t.title, t.status, t.priority, t.category,
            ${istDay('t.createdAt')} AS day, ${istTime('t.createdAt')} AS at,
            ${istDay('COALESCE(t.dueDate, t.customTatDeadline)')} AS dueDay,
            tc.name AS categoryName, d.name AS department,
            r.firstName, r.lastName, asg.firstName AS asgFirst, asg.lastName AS asgLast,
            pu.unit_number AS unit
       FROM tickets t
       LEFT JOIN ticket_categories tc ON tc.id = t.categoryId
       LEFT JOIN departments d ON d.id = t.departmentId
       LEFT JOIN residents r ON r.id = t.residentId
       LEFT JOIN user_details asg ON asg.userId = t.assignedToUserId
       LEFT JOIN property_units pu ON pu.id = t.unitId
      WHERE t.locId = :loc AND t.createdAt >= :fromUtc AND t.createdAt < :toUtcExcl`,
    ctx,
  )
  return part(
    rows.map((r) => ({
      id: `ticket:${r.id}`,
      category: 'tickets' as const,
      kind: 'Ticket raised',
      title: `${r.ticketNumber ? `${r.ticketNumber} · ` : ''}${r.title}`,
      subtitle: r.categoryName || prettyStatus(r.category),
      startDate: r.day,
      endDate: r.day,
      startTime: r.at,
      endTime: null,
      status: prettyStatus(r.status),
      details: details([
        ['Category', r.categoryName || prettyStatus(r.category)],
        ['Department', r.department],
        ['Priority', prettyStatus(r.priority)],
        ['Raised by', fullName(r.firstName, r.lastName)],
        ['Flat', r.unit],
        ['Assigned to', fullName(r.asgFirst, r.asgLast)],
        ['Due', r.dueDay],
      ]),
      link: '/admin/tickets',
    })),
  )
}

// ── Asset maintenance & compliance ────────────────────────────────────────────

async function fetchAssets(ctx: Ctx): Promise<Part> {
  const canMaint = ctx.perms.can('ASSET.MAINTENANCE', 'view')
  const canComp = ctx.perms.can('ASSET.COMPLIANCE', 'view')
  const assetJoin = `JOIN assets ast ON ast.id = x.assetId AND ast.locationId = :loc
                     LEFT JOIN asset_items ai ON ai.id = ast.itemId`
  const assetCols = `ast.id AS assetId, ai.name AS itemName, ast.assetTag, ast.serialNumber`
  const inRange = (col: string) => `(${col} >= :from AND ${col} < :toExcl)`

  type Source = { sql: string; build: (r: Row) => Omit<CalendarItem, 'category' | 'link' | 'endDate'> }
  const sources: Source[] = []

  if (canMaint) {
    sources.push(
      {
        sql: `SELECT x.id, x.serviceType, x.completionStatus, x.performedBy, x.cost, x.description,
                     ${plainDay('x.serviceDate')} AS day, 'service' AS which, ${assetCols}
                FROM asset_service_logs x ${assetJoin} WHERE ${inRange('x.serviceDate')}
              UNION ALL
              SELECT x.id, x.serviceType, x.completionStatus, x.performedBy, x.cost, x.description,
                     ${plainDay('x.nextServiceDate')} AS day, 'serviceDue' AS which, ${assetCols}
                FROM asset_service_logs x ${assetJoin} WHERE ${inRange('x.nextServiceDate')}`,
        build: (r) => ({
          id: `asset:${r.which}:${r.id}`,
          kind: r.which === 'service' ? 'Service' : 'Next service due',
          title: '',
          subtitle: prettyStatus(r.serviceType),
          startDate: r.day,
          startTime: null,
          endTime: null,
          status: r.which === 'service' ? prettyStatus(r.completionStatus) : 'Due',
          details: details([
            ['Service type', prettyStatus(r.serviceType)],
            ['Performed by', r.which === 'service' ? r.performedBy : null],
            ['Cost', r.which === 'service' && r.cost ? `₹${Number(r.cost)}` : null],
            ['Description', r.description],
          ]),
        }),
      },
      {
        sql: `SELECT x.id, x.result, x.calibratedBy, x.certificateNumber,
                     ${plainDay('x.calibrationDate')} AS day, 'calibration' AS which, ${assetCols}
                FROM asset_calibrations x ${assetJoin} WHERE ${inRange('x.calibrationDate')}
              UNION ALL
              SELECT x.id, x.result, x.calibratedBy, x.certificateNumber,
                     ${plainDay('x.nextCalibrationDate')} AS day, 'calibrationDue' AS which, ${assetCols}
                FROM asset_calibrations x ${assetJoin} WHERE ${inRange('x.nextCalibrationDate')}`,
        build: (r) => ({
          id: `asset:${r.which}:${r.id}`,
          kind: r.which === 'calibration' ? 'Calibration' : 'Calibration due',
          title: '',
          subtitle: null,
          startDate: r.day,
          startTime: null,
          endTime: null,
          status: r.which === 'calibration' ? prettyStatus(r.result) : 'Due',
          details: details([
            ['Calibrated by', r.which === 'calibration' ? r.calibratedBy : null],
            ['Certificate no.', r.certificateNumber],
          ]),
        }),
      },
      {
        // Warranty records, plus the asset's own warranty date when it has no record.
        sql: `SELECT x.id, x.warrantyType, x.coverageDetails,
                     ${plainDay('x.warrantyEndDate')} AS day, 'warranty' AS which, ${assetCols}
                FROM asset_warranties x ${assetJoin} WHERE ${inRange('x.warrantyEndDate')}
              UNION ALL
              SELECT ast.id, NULL, NULL, ${plainDay('ast.warrantyEndDate')} AS day, 'warranty' AS which,
                     ast.id AS assetId, ai.name AS itemName, ast.assetTag, ast.serialNumber
                FROM assets ast LEFT JOIN asset_items ai ON ai.id = ast.itemId
               WHERE ast.locationId = :loc AND ${inRange('ast.warrantyEndDate')}
                 AND NOT EXISTS (SELECT 1 FROM asset_warranties w WHERE w.assetId = ast.id)`,
        build: (r) => ({
          id: `asset:warranty:${r.id}`,
          kind: 'Warranty expires',
          title: '',
          subtitle: prettyStatus(r.warrantyType),
          startDate: r.day,
          startTime: null,
          endTime: null,
          status: r.day < ctx.today ? 'Expired' : 'Expiring',
          details: details([
            ['Warranty type', prettyStatus(r.warrantyType)],
            ['Coverage', r.coverageDetails],
          ]),
        }),
      },
    )
  }
  if (canComp) {
    sources.push(
      {
        sql: `SELECT x.id, x.inspectionType, x.inspectorName, x.result, x.findings,
                     ${plainDay('x.inspectionDate')} AS day, 'inspection' AS which, ${assetCols}
                FROM asset_compliance_inspections x ${assetJoin} WHERE ${inRange('x.inspectionDate')}
              UNION ALL
              SELECT x.id, x.inspectionType, x.inspectorName, x.result, x.findings,
                     ${plainDay('x.nextInspectionDate')} AS day, 'inspectionDue' AS which, ${assetCols}
                FROM asset_compliance_inspections x ${assetJoin} WHERE ${inRange('x.nextInspectionDate')}`,
        build: (r) => ({
          id: `asset:${r.which}:${r.id}`,
          kind: r.which === 'inspection' ? 'Inspection' : 'Inspection due',
          title: '',
          subtitle: prettyStatus(r.inspectionType),
          startDate: r.day,
          startTime: null,
          endTime: null,
          status: r.which === 'inspection' ? prettyStatus(r.result) : 'Due',
          details: details([
            ['Inspection type', prettyStatus(r.inspectionType)],
            ['Inspector', r.which === 'inspection' ? r.inspectorName : null],
            ['Findings', r.which === 'inspection' ? r.findings : null],
          ]),
        }),
      },
      {
        sql: `SELECT x.id, x.certificationType, x.certificateNumber, x.issuingAuthority,
                     ${plainDay('x.expiryDate')} AS day, 'certificate' AS which, ${assetCols}
                FROM asset_compliance_certifications x ${assetJoin} WHERE ${inRange('x.expiryDate')}`,
        build: (r) => ({
          id: `asset:certificate:${r.id}`,
          kind: 'Certificate expires',
          title: '',
          subtitle: prettyStatus(r.certificationType),
          startDate: r.day,
          startTime: null,
          endTime: null,
          status: r.day < ctx.today ? 'Expired' : 'Expiring',
          details: details([
            ['Certificate', prettyStatus(r.certificationType)],
            ['Certificate no.', r.certificateNumber],
            ['Issued by', r.issuingAuthority],
          ]),
        }),
      },
    )
  }

  const results = await Promise.all(sources.map((s) => select(s.sql, ctx)))
  const items: CalendarItem[] = []
  results.forEach((rows, i) => {
    for (const r of rows) {
      const built = sources[i]!.build(r)
      const asset = [r.itemName || 'Asset', r.assetTag || r.serialNumber].filter(Boolean).join(' · ')
      items.push({
        ...built,
        title: `${built.kind}: ${asset}`,
        category: 'assets',
        endDate: built.startDate,
        details: [{ label: 'Asset', value: asset }, ...built.details],
        link: '/admin/asset-management',
      })
    }
  })
  return part(items)
}

// ── Visitors (pre-approved passes + gate entries) ─────────────────────────────

async function fetchVisitors(ctx: Ctx): Promise<Part> {
  const items: CalendarItem[] = []
  const summaries: CalendarDaySummary[] = []
  const link = '/admin/visitor-history'

  if (ctx.perms.can('GNS.PREAPPROVED', 'view')) {
    const rows = await select(
      `SELECT g.id, g.visitorName, g.visitorType, g.visitorPhone, g.status, g.scheduleType, g.vehicleNumber,
              g.company, g.personToMeet, g.notes,
              ${plainDay('g.startDate')} AS sDay, ${plainDay('COALESCE(g.endDate, g.startDate)')} AS eDay,
              TIME_FORMAT(g.startTime, '%H:%i') AS sTime, TIME_FORMAT(g.endTime, '%H:%i') AS eTime,
              r.firstName, r.lastName, pu.unit_number AS unit
         FROM gate_preapproved g
         LEFT JOIN residents r ON r.id = g.residentId
         LEFT JOIN property_units pu ON pu.id = g.unitId
        WHERE g.locId = :loc AND g.startDate IS NOT NULL
          AND g.startDate <= :to AND DATE(COALESCE(g.endDate, g.startDate)) >= :from`,
      ctx,
    )
    for (const r of rows) {
      const eDay = r.eDay && r.eDay >= r.sDay ? r.eDay : r.sDay
      items.push({
        id: `preapproved:${r.id}`,
        category: 'visitors',
        kind: 'Expected visitor',
        title: `${r.visitorName}${r.visitorType ? ` (${prettyStatus(r.visitorType)})` : ''}`,
        subtitle: r.unit ? `Flat ${r.unit}` : fullName(r.firstName, r.lastName),
        startDate: r.sDay,
        endDate: eDay,
        startTime: r.sTime,
        endTime: r.eTime,
        status: prettyStatus(r.status),
        details: details([
          ['Visitor type', prettyStatus(r.visitorType)],
          ['Approved by', fullName(r.firstName, r.lastName)],
          ['Flat', r.unit],
          ['Phone', r.visitorPhone],
          ['Visits', r.scheduleType === 'FREQUENT' ? 'Frequent' : r.scheduleType === 'ONCE' ? 'Once' : null],
          ['Vehicle', r.vehicleNumber],
          ['Company', r.company],
          ['To meet', r.personToMeet],
          ['Notes', r.notes],
        ]),
        link,
      })
    }
  }

  if (ctx.perms.can('GNS.ENTRY_LOGS', 'view')) {
    const at = 'COALESCE(ge.clockedInAt, ge.createdAt)'
    const rows = await select(
      `SELECT ge.id, ge.visitorName, ge.visitorType, ge.visitorPhone, ge.status, ge.vehicleNumber,
              ge.company, ge.personToMeet, ge.numberOfPeople, ge.approverName,
              ${istDay(at)} AS day, ${istTime(at)} AS inTime, ${istTime('ge.clockedOutAt')} AS outTime,
              ${istDay('ge.clockedOutAt')} AS outDay, pu.unit_number AS unit
         FROM gate_entries ge
         LEFT JOIN property_units pu ON pu.id = ge.unitId
        WHERE ge.locId = :loc AND ${at} >= :fromUtc AND ${at} < :toUtcExcl`,
      ctx,
    )
    if (!ctx.fullDetail) {
      summaries.push(...summarize(rows, 'visitors', 'Visitor entries', link, (r) => prettyStatus(r.status) || 'Entry'))
    } else {
      for (const r of rows) {
        items.push({
          id: `gateEntry:${r.id}`,
          category: 'visitors',
          kind: 'Visitor entry',
          title: `${r.visitorName}${r.visitorType ? ` (${prettyStatus(r.visitorType)})` : ''}`,
          subtitle: r.unit ? `Flat ${r.unit}` : r.personToMeet || null,
          startDate: r.day,
          endDate: r.day,
          startTime: r.inTime,
          endTime: r.outDay === r.day ? r.outTime : null,
          status: prettyStatus(r.status),
          details: details([
            ['Visitor type', prettyStatus(r.visitorType)],
            ['Flat', r.unit],
            ['People', r.numberOfPeople],
            ['Checked out', r.outTime ? `${r.outDay !== r.day ? `${r.outDay} ` : ''}${r.outTime}` : null],
            ['Approved by', r.approverName],
            ['Phone', r.visitorPhone],
            ['Vehicle', r.vehicleNumber],
            ['Company', r.company],
            ['To meet', r.personToMeet],
          ]),
          link,
        })
      }
    }
  }
  return part(items, summaries)
}

// ── Meal orders ───────────────────────────────────────────────────────────────

async function fetchFood(ctx: Ctx): Promise<Part> {
  const rows = await select(
    `SELECT o.id, o.orderStatus, o.orderType, o.serviceType, o.quantity, o.totalAmount, o.isPackageCovered,
            ${plainDay('o.date')} AS day,
            COALESCE(ss.name, gms.name) AS slot, TIME_FORMAT(gms.startTime, '%H:%i') AS slotStart,
            TIME_FORMAT(gms.endTime, '%H:%i') AS slotEnd,
            r.firstName, r.lastName, fm.firstName AS fmFirst, fm.lastName AS fmLast, pu.unit_number AS unit
       FROM fnb_resident_orders o
       LEFT JOIN fnb_global_meal_slots gms ON gms.id = o.mealSlotId
       LEFT JOIN fnb_property_special_slots ss ON ss.id = o.specialMealSlotId
       LEFT JOIN residents r ON r.id = o.residentId
       LEFT JOIN resident_family_members fm ON fm.id = o.familyMemberId
       LEFT JOIN property_units pu ON pu.id = COALESCE(o.unitId, r.unitId)
      WHERE o.locId = :loc AND o.date >= :from AND o.date <= :to`,
    ctx,
  )
  const link = '/admin/fnb-history'
  if (!ctx.fullDetail) {
    return part(
      [],
      summarize(rows, 'food', 'Meal orders', link, (r) => r.slot || 'Other'),
    )
  }
  return part(
    rows.map((r) => {
      const who = fullName(r.fmFirst, r.fmLast) || fullName(r.firstName, r.lastName) || 'Resident'
      return {
        id: `food:${r.id}`,
        category: 'food' as const,
        kind: r.slot ? `${r.slot} order` : 'Meal order',
        title: `${r.slot || 'Meal'} · ${who}`,
        subtitle: r.unit ? `Flat ${r.unit}` : null,
        startDate: r.day,
        endDate: r.day,
        startTime: toHHmm(r.slotStart),
        endTime: toHHmm(r.slotEnd),
        status: prettyStatus(r.orderStatus),
        details: details([
          ['Resident', who],
          ['Flat', r.unit],
          ['Meal', r.slot],
          ['Service', prettyStatus(r.serviceType)],
          ['Quantity', r.quantity],
          [
            'Amount',
            Number(r.isPackageCovered) ? 'Covered by package' : r.totalAmount ? `₹${Number(r.totalAmount)}` : null,
          ],
        ]),
        link,
      }
    }),
  )
}

// ── Feedback forms ────────────────────────────────────────────────────────────

async function fetchFeedback(ctx: Ctx): Promise<Part> {
  const rows = await select(
    `SELECT f.id, f.title, f.status, f.audience, 'sent' AS which,
            ${istDay('f.sentAt')} AS day, ${istTime('f.sentAt')} AS at,
            (SELECT COUNT(*) FROM feedback_form_recipients fr WHERE fr.formId = f.id) AS recipients
       FROM feedback_forms f
      WHERE f.locationId = :loc AND f.isDeleted = 0 AND f.status = 'SENT'
        AND f.sentAt >= :fromUtc AND f.sentAt < :toUtcExcl
     UNION ALL
     SELECT f.id, f.title, f.status, f.audience, 'closes' AS which,
            ${istDay('f.expiryDate')} AS day, ${istTime('f.expiryDate')} AS at,
            (SELECT COUNT(*) FROM feedback_form_recipients fr WHERE fr.formId = f.id) AS recipients
       FROM feedback_forms f
      WHERE f.locationId = :loc AND f.isDeleted = 0 AND f.status = 'SENT'
        AND f.expiryDate >= :fromUtc AND f.expiryDate < :toUtcExcl`,
    ctx,
  )
  return part(
    rows.map((r) => ({
      id: `feedback:${r.which}:${r.id}`,
      category: 'feedback' as const,
      kind: r.which === 'sent' ? 'Feedback form sent' : 'Feedback form closes',
      title: `${r.which === 'sent' ? 'Sent' : 'Closes'}: ${r.title}`,
      subtitle: prettyStatus(r.audience),
      startDate: r.day,
      endDate: r.day,
      startTime: r.which === 'sent' ? r.at : null,
      endTime: null,
      status: r.which === 'closes' ? (r.day < ctx.today ? 'Closed' : 'Open') : 'Sent',
      details: details([
        ['Audience', prettyStatus(r.audience)],
        ['Recipients', Number(r.recipients) || null],
      ]),
      link: '/admin/settings/feedback',
    })),
  )
}

const FETCHERS: Record<CalendarCategory, (ctx: Ctx) => Promise<Part>> = {
  events: fetchEvents,
  appointments: fetchAppointments,
  careTasks: fetchCareTasks,
  shifts: fetchShifts,
  amenities: fetchAmenities,
  tickets: fetchTickets,
  assets: fetchAssets,
  visitors: fetchVisitors,
  food: fetchFood,
  feedback: fetchFeedback,
}

/** Categories this user may see at the property (super admins: all). */
export const allowedCategories = (perms: PermissionSet): CalendarCategory[] =>
  CALENDAR_CATEGORIES.map((c) => c.key).filter((key) => {
    const keys = CATEGORY_RESOURCES[key]
    return !keys || keys.some((k) => perms.can(k, 'view'))
  })

const sortItems = (a: CalendarItem, b: CalendarItem) =>
  a.startDate.localeCompare(b.startDate) ||
  // All-day first, then by time
  (a.startTime === null ? -1 : 0) - (b.startTime === null ? -1 : 0) ||
  (a.startTime || '').localeCompare(b.startTime || '') ||
  a.title.localeCompare(b.title)

export async function getActivityCalendar(params: {
  locationId: string
  from: string
  to: string
  categories: CalendarCategory[] | null
  perms: PermissionSet
}): Promise<CalendarResult> {
  const { locationId, from, to, perms } = params
  const allowed = allowedCategories(perms)
  const wanted = params.categories ? allowed.filter((c) => params.categories!.includes(c)) : allowed

  const ctx: Ctx = {
    loc: locationId,
    from,
    to,
    toExcl: addDays(to, 1),
    fromUtc: istMidnightUtc(from),
    toUtcExcl: istMidnightUtc(addDays(to, 1)),
    today: todayYmdLocal(),
    fullDetail: from === to,
    perms,
  }

  const parts = await Promise.all(wanted.map((c) => FETCHERS[c](ctx)))
  const items = parts.flatMap((p) => p.items).filter((i) => i.startDate && i.endDate >= from && i.startDate <= to)
  const summaries = parts.flatMap((p) => p.summaries)
  items.sort(sortItems)
  summaries.sort((a, b) => a.date.localeCompare(b.date))

  return {
    from,
    to,
    today: ctx.today,
    fullDetail: ctx.fullDetail,
    categories: CALENDAR_CATEGORIES.filter((c) => allowed.includes(c.key)).map((c) => ({ key: c.key, label: c.label })),
    items,
    summaries,
  }
}
