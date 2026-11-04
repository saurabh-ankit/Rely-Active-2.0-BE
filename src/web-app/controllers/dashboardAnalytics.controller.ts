import type { Request, Response } from 'express'
import {
  TREND_DAYS,
  TREND_MONTHS,
  dayMap,
  daysAgo,
  daysAhead,
  lastDays,
  lastMonths,
  localDaySql,
  localHourSql,
  localMonthSql,
  monthMap,
  num,
  pct,
  round1,
  scopedQuery,
  userNameSql,
} from '../../services/dashboardQuery.service.js'
import { ANALYTICS_TABS, type AnalyticsTab } from '../../validations/dashboard.validation.js'

/**
 * Analytics for the extra dashboard tabs, one tab per request so a tab's queries only run when
 * it is opened. Scoped to one property, or every property when no location / 'ALL' is given.
 */

type Ctx = ReturnType<typeof scopedQuery> & {
  days: string[]
  months: string[]
  today: string
  thisMonth: string
  fromDay: string
  fromMonth: string
}

const countOf = <K extends string>(rows: { k: string; n: number }[], key: K) => num(rows.find((r) => r.k === key)?.n)
const pairs = (rows: { k: string | null; n: number }[]) =>
  rows.map((r) => ({ key: String(r.k ?? 'Other'), count: num(r.n) }))

// ── Tickets ──────────────────────────────────────────────────────────────────
async function tickets({ at, q, months, fromMonth, thisMonth }: Ctx) {
  const OPEN = `t.status IN ('OPEN','IN_PROGRESS','ON_HOLD')`
  const DONE_AT = 'COALESCE(t.resolvedAt, t.closedAt)'
  const DEADLINE = 'COALESCE(t.customTatDeadline, t.dueDate)'
  const [totals] = await q(
    `
    SELECT COUNT(*) AS total, SUM(${OPEN}) AS open,
      SUM(${OPEN} AND ${DEADLINE} < UTC_TIMESTAMP()) AS overdue,
      SUM(${OPEN} AND t.escalatedAt IS NOT NULL) AS escalated,
      SUM(t.status IN ('RESOLVED','CLOSED') AND ${localMonthSql(DONE_AT)} = :thisMonth) AS resolvedThisMonth,
      SUM(${localMonthSql('t.createdAt')} = :thisMonth) AS raisedThisMonth,
      AVG(CASE WHEN t.status IN ('RESOLVED','CLOSED') AND ${DONE_AT} >= :fromMonth
        THEN TIMESTAMPDIFF(MINUTE, t.createdAt, ${DONE_AT}) END) AS avgMinutes,
      SUM(t.status IN ('RESOLVED','CLOSED') AND ${DEADLINE} IS NOT NULL AND ${DONE_AT} IS NOT NULL) AS withDeadline,
      SUM(t.status IN ('RESOLVED','CLOSED') AND ${DEADLINE} IS NOT NULL AND ${DONE_AT} <= ${DEADLINE}) AS onTime
    FROM tickets t WHERE ${at('t.locId')}`,
    { thisMonth, fromMonth },
  )
  const byCategory = await q<{ name: string; total: number; open: number }>(`
    SELECT x.name, COUNT(*) AS total, SUM(x.isOpen) AS open FROM (
      SELECT COALESCE(c.name, NULLIF(t.category, ''), 'Uncategorised') AS name, ${OPEN} AS isOpen
      FROM tickets t LEFT JOIN ticket_categories c ON c.id = t.categoryId WHERE ${at('t.locId')}
    ) x GROUP BY x.name ORDER BY total DESC LIMIT 8`)
  const byDepartment = await q<{ name: string; total: number; open: number; avgMinutes: number | null }>(`
    SELECT COALESCE(d.name, 'Unassigned') AS name, COUNT(*) AS total, SUM(${OPEN}) AS open,
      AVG(CASE WHEN t.status IN ('RESOLVED','CLOSED') THEN TIMESTAMPDIFF(MINUTE, t.createdAt, ${DONE_AT}) END) AS avgMinutes
    FROM tickets t LEFT JOIN departments d ON d.id = t.departmentId
    WHERE ${at('t.locId')} GROUP BY name ORDER BY total DESC LIMIT 8`)
  const created = await q<{ m: string; n: number }>(
    `SELECT ${localMonthSql('t.createdAt')} AS m, COUNT(*) AS n FROM tickets t
    WHERE ${at('t.locId')} AND t.createdAt >= :fromMonth GROUP BY m`,
    { fromMonth },
  )
  const resolved = await q<{ m: string; n: number }>(
    `SELECT ${localMonthSql(DONE_AT)} AS m, COUNT(*) AS n FROM tickets t
    WHERE ${at('t.locId')} AND t.status IN ('RESOLVED','CLOSED') AND ${DONE_AT} >= :fromMonth GROUP BY m`,
    { fromMonth },
  )
  const assignees = await q<{ name: string | null; open: number; resolved: number }>(`
    SELECT ${userNameSql('t.assignedToUserId')} AS name, SUM(${OPEN}) AS open,
      SUM(t.status IN ('RESOLVED','CLOSED')) AS resolved
    FROM tickets t WHERE ${at('t.locId')} AND t.assignedToUserId IS NOT NULL
    GROUP BY t.assignedToUserId ORDER BY open DESC, resolved DESC LIMIT 6`)
  const feedback = await q<{ k: string; n: number }>(`
    SELECT f.rating AS k, COUNT(*) AS n FROM ticket_feedbacks f
    JOIN tickets t ON t.id = f.ticketId AND ${at('t.locId')} GROUP BY f.rating`)
  const [extended] = await q(
    `SELECT COUNT(*) AS n FROM ticket_tat_histories h JOIN tickets t ON t.id = h.ticketId AND ${at('t.locId')}
    WHERE h.createdAt >= :fromMonth`,
    { fromMonth },
  )
  const createdBy = monthMap(created)
  const resolvedBy = monthMap(resolved)
  return {
    total: num(totals?.total),
    open: num(totals?.open),
    overdue: num(totals?.overdue),
    escalated: num(totals?.escalated),
    raisedThisMonth: num(totals?.raisedThisMonth),
    resolvedThisMonth: num(totals?.resolvedThisMonth),
    avgResolutionHours: round1(num(totals?.avgMinutes) / 60),
    onTimeRate: pct(num(totals?.onTime), num(totals?.withDeadline)),
    deadlinesExtended: num(extended?.n),
    byCategory: byCategory.map((r) => ({ name: r.name, total: num(r.total), open: num(r.open) })),
    byDepartment: byDepartment.map((r) => ({
      name: r.name,
      total: num(r.total),
      open: num(r.open),
      avgResolutionHours: round1(num(r.avgMinutes) / 60),
    })),
    monthly: months.map((m) => ({ month: m, created: createdBy.get(m) ?? 0, resolved: resolvedBy.get(m) ?? 0 })),
    topAssignees: assignees.map((a) => ({ name: a.name ?? 'Unknown', open: num(a.open), resolved: num(a.resolved) })),
    feedback: {
      good: countOf(feedback, 'GOOD'),
      average: countOf(feedback, 'AVERAGE'),
      poor: countOf(feedback, 'POOR'),
    },
  }
}

// ── Visitors & gate ──────────────────────────────────────────────────────────
async function visitors({ at, q, today }: Ctx) {
  const from30 = daysAgo(29)
  const days30 = lastDays(30)
  const PEOPLE = 'COALESCE(numberOfPeople, 1)'
  const RECENT = `${at('locId')} AND ${localDaySql('createdAt')} >= :from30`
  const [totals] = await q(
    `
    SELECT COUNT(*) AS entries, SUM(${PEOPLE}) AS people,
      SUM(CASE WHEN ${localDaySql('createdAt')} = :today THEN ${PEOPLE} ELSE 0 END) AS today,
      SUM(entrySource = 'Preapproved') AS preapproved,
      AVG(CASE WHEN clockedInAt IS NOT NULL AND clockedOutAt IS NOT NULL
        THEN TIMESTAMPDIFF(MINUTE, clockedInAt, clockedOutAt) END) AS avgMinutes
    FROM gate_entries WHERE ${RECENT}`,
    { from30, today },
  )
  const [now] = await q(`
    SELECT SUM(status = 'Inside') AS inside, SUM(status = 'PendingApproval') AS awaiting
    FROM gate_entries WHERE ${at('locId')}`)
  const trend = await q<{ d: string; n: number }>(
    `SELECT ${localDaySql('createdAt')} AS d, SUM(${PEOPLE}) AS n FROM gate_entries WHERE ${RECENT} GROUP BY d`,
    { from30 },
  )
  const hours = await q<{ h: number; n: number }>(
    `SELECT ${localHourSql('createdAt')} AS h, SUM(${PEOPLE}) AS n FROM gate_entries WHERE ${RECENT} GROUP BY h`,
    { from30 },
  )
  const byType = await q<{ k: string; n: number }>(
    `SELECT visitorType AS k, SUM(${PEOPLE}) AS n FROM gate_entries WHERE ${RECENT} GROUP BY k ORDER BY n DESC`,
    { from30 },
  )
  const byStatus = await q<{ k: string; n: number }>(
    `SELECT status AS k, COUNT(*) AS n FROM gate_entries WHERE ${RECENT} GROUP BY k`,
    { from30 },
  )
  const topUnits = await q<{ unit: string; n: number }>(
    `
    SELECT pu.unit_number AS unit, COUNT(*) AS n FROM gate_entries g
    JOIN property_units pu ON pu.id = g.unitId
    WHERE ${at('g.locId')} AND ${localDaySql('g.createdAt')} >= :from30
    GROUP BY pu.id, pu.unit_number ORDER BY n DESC LIMIT 6`,
    { from30 },
  )
  const [passes] = await q(
    `
    SELECT SUM(status = 'Pending' AND (endDate IS NULL OR endDate >= UTC_TIMESTAMP())) AS active,
      SUM(status = 'Scanned') AS scanned, SUM(status = 'Expired') AS expired,
      SUM(status IN ('Cancelled','Rejected')) AS cancelled
    FROM gate_preapproved WHERE ${at('locId')}`,
  )
  const [items] = await q(
    `
    SELECT COALESCE(SUM(i.quantity), 0) AS n FROM gate_entry_items i
    JOIN gate_entries g ON g.id = i.entryId AND ${at('g.locId')} AND ${localDaySql('g.createdAt')} >= :from30`,
    { from30 },
  )
  const trendBy = dayMap(trend)
  const hourBy = new Map(hours.map((h) => [num(h.h), num(h.n)]))
  return {
    last30Days: { entries: num(totals?.entries), people: num(totals?.people) },
    today: num(totals?.today),
    insideNow: num(now?.inside),
    awaitingApproval: num(now?.awaiting),
    preapprovedRate: pct(num(totals?.preapproved), num(totals?.entries)),
    avgVisitMinutes: Math.round(num(totals?.avgMinutes)),
    itemsLogged: num(items?.n),
    trend: days30.map((d) => ({ day: d, count: trendBy.get(d) ?? 0 })),
    byHour: Array.from({ length: 24 }, (_, h) => ({ hour: h, count: hourBy.get(h) ?? 0 })),
    byType: pairs(byType),
    byStatus: pairs(byStatus),
    bySource: {
      preapproved: num(totals?.preapproved),
      walkIn: num(totals?.entries) - num(totals?.preapproved),
    },
    topUnits: topUnits.map((u) => ({ unit: u.unit, count: num(u.n) })),
    passes: {
      active: num(passes?.active),
      scanned: num(passes?.scanned),
      expired: num(passes?.expired),
      cancelled: num(passes?.cancelled),
    },
  }
}

// ── Food & beverage ──────────────────────────────────────────────────────────
async function dining({ at, q, days, months, fromDay, fromMonth, thisMonth }: Ctx) {
  const from30 = daysAgo(29)
  const LIVE = `orderStatus <> 'cancelled'`
  const [totals] = await q(
    `
    SELECT SUM(${LIVE} AND DATE_FORMAT(date, '%Y-%m') = :thisMonth) AS orders,
      SUM(CASE WHEN ${LIVE} AND DATE_FORMAT(date, '%Y-%m') = :thisMonth THEN totalAmount ELSE 0 END) AS revenue,
      SUM(orderStatus = 'cancelled' AND DATE_FORMAT(date, '%Y-%m') = :thisMonth) AS cancelled,
      AVG(CASE WHEN acceptedAt IS NOT NULL AND readyAt IS NOT NULL AND date >= :from30
        THEN TIMESTAMPDIFF(MINUTE, acceptedAt, readyAt) END) AS prepMinutes
    FROM fnb_resident_orders WHERE ${at('locId')}`,
    { thisMonth, from30 },
  )
  const [attendance] = await q(
    `
    SELECT SUM(CASE WHEN status = 'attended' THEN CASE WHEN is_guest = 1 THEN COALESCE(guest_count, 1) ELSE 1 END ELSE 0 END) AS attended,
      SUM(status = 'attended' AND marked_late = 1) AS late
    FROM fnb_food_attendances WHERE ${at('loc_id')} AND DATE_FORMAT(date, '%Y-%m') = :thisMonth`,
    { thisMonth },
  )
  const [packages] = await q(`
    SELECT COUNT(*) AS n, COALESCE(SUM(p.totalPrice), 0) AS value FROM fnb_resident_packages p
    JOIN residents r ON r.id = p.residentId AND ${at('r.locId')} WHERE p.status = 'active'`)
  const daily = await q<{ d: string; t: string; n: number }>(
    `
    SELECT DATE(date) AS d, serviceType AS t, COUNT(*) AS n FROM fnb_resident_orders
    WHERE ${at('locId')} AND ${LIVE} AND date >= :fromDay GROUP BY d, t`,
    { fromDay },
  )
  const slots = await q<{ name: string; attended: number; absent: number; optedOut: number; late: number }>(
    `
    SELECT COALESCE(gs.name, 'Other') AS name,
      SUM(a.status = 'attended') AS attended, SUM(a.status = 'absent') AS absent,
      SUM(a.status = 'opted_out') AS optedOut, SUM(a.status = 'attended' AND a.marked_late = 1) AS late
    FROM fnb_food_attendances a
    LEFT JOIN fnb_property_meal_slots ps ON ps.id = a.meal_slot_id
    LEFT JOIN fnb_global_meal_slots gs ON gs.id = COALESCE(ps.globalMealSlotId, a.meal_slot_id)
    WHERE ${at('a.loc_id')} AND a.date >= :from30
    GROUP BY name ORDER BY MIN(COALESCE(ps.startTime, gs.startTime))`,
    { from30 },
  )
  const dishes = await q<{ name: string; qty: number; amount: number }>(
    `
    SELECT d.name, SUM(od.quantity) AS qty, SUM(od.amount) AS amount
    FROM fnb_resident_order_details od
    JOIN fnb_resident_orders o ON o.id = od.orderId AND ${at('o.locId')} AND o.orderStatus <> 'cancelled' AND o.date >= :from30
    JOIN fnb_dishes d ON d.id = od.dishId
    GROUP BY d.id, d.name ORDER BY qty DESC LIMIT 8`,
    { from30 },
  )
  const orderTypes = await q<{ k: string; n: number }>(
    `SELECT orderType AS k, COUNT(*) AS n FROM fnb_resident_orders
    WHERE ${at('locId')} AND ${LIVE} AND date >= :from30 GROUP BY k ORDER BY n DESC`,
    { from30 },
  )
  const diets = await q<{ k: string; n: number }>(`
    SELECT COALESCE(p.dietaryPreference, 'mixed') AS k, COUNT(*) AS n FROM fnb_resident_packages p
    JOIN residents r ON r.id = p.residentId AND ${at('r.locId')} WHERE p.status = 'active' GROUP BY k ORDER BY n DESC`)
  const revenue = await q<{ m: string; n: number }>(
    `SELECT DATE_FORMAT(date, '%Y-%m') AS m, SUM(totalAmount) AS n FROM fnb_resident_orders
    WHERE ${at('locId')} AND ${LIVE} AND date >= :fromMonth GROUP BY m`,
    { fromMonth },
  )
  const revenueBy = monthMap(revenue)
  const dailyOf = (d: string, t: string) => num(daily.find((r) => String(r.d).slice(0, 10) === d && r.t === t)?.n)
  return {
    ordersThisMonth: num(totals?.orders),
    revenueThisMonth: num(totals?.revenue),
    cancelledThisMonth: num(totals?.cancelled),
    avgPrepMinutes: Math.round(num(totals?.prepMinutes)),
    dineInThisMonth: num(attendance?.attended),
    lateMarksThisMonth: num(attendance?.late),
    activePackages: num(packages?.n),
    activePackagesValue: num(packages?.value),
    daily: days.map((d) => ({ day: d, dineIn: dailyOf(d, 'dine_in'), roomService: dailyOf(d, 'room_service') })),
    mealSlots: slots.map((s) => ({
      name: s.name,
      attended: num(s.attended),
      absent: num(s.absent),
      optedOut: num(s.optedOut),
      late: num(s.late),
    })),
    topDishes: dishes.map((d) => ({ name: d.name, quantity: num(d.qty), amount: num(d.amount) })),
    orderTypes: pairs(orderTypes),
    dietaryPreferences: pairs(diets),
    monthlyRevenue: months.map((m) => ({ month: m, revenue: revenueBy.get(m) ?? 0 })),
  }
}

// ── Events & amenities ───────────────────────────────────────────────────────
async function events({ at, q, months, fromMonth, thisMonth }: Ctx) {
  const from30 = daysAgo(29)
  const [totals] = await q(
    `
    SELECT SUM(endDate >= UTC_TIMESTAMP()) AS upcoming,
      SUM(${localMonthSql('startDate')} = :thisMonth) AS thisMonth,
      SUM(eventType = 'special') AS special, SUM(eventType = 'regular') AS regular
    FROM events WHERE isDeleted = 0 AND ${at('locationId')}`,
    { thisMonth },
  )
  const [regs] = await q(
    `
    SELECT SUM(CASE WHEN ${localMonthSql('r.createdAt')} = :thisMonth THEN COALESCE(r.seatCount, 1) ELSE 0 END) AS seatsThisMonth,
      SUM(e.endDate < UTC_TIMESTAMP() AND r.status IN ('CONFIRMED','ATTENDED','NO_SHOW')) AS pastBooked,
      SUM(e.endDate < UTC_TIMESTAMP() AND r.status = 'ATTENDED') AS pastAttended
    FROM event_registrations r JOIN events e ON e.id = r.eventId
    WHERE r.isDeleted = 0 AND ${at('r.locationId')} AND r.createdAt >= :fromMonth`,
    { thisMonth, fromMonth },
  )
  const regStatus = await q<{ k: string; n: number }>(
    `SELECT status AS k, COUNT(*) AS n FROM event_registrations
    WHERE isDeleted = 0 AND ${at('locationId')} AND createdAt >= :fromMonth GROUP BY k`,
    { fromMonth },
  )
  const held = await q<{ m: string; n: number }>(
    `SELECT ${localMonthSql('startDate')} AS m, COUNT(*) AS n FROM events
    WHERE isDeleted = 0 AND ${at('locationId')} AND startDate >= :fromMonth GROUP BY m`,
    { fromMonth },
  )
  const seats = await q<{ m: string; booked: number; attended: number }>(
    `
    SELECT ${localMonthSql('createdAt')} AS m,
      SUM(CASE WHEN status <> 'CANCELLED' THEN COALESCE(seatCount, 1) ELSE 0 END) AS booked,
      SUM(status = 'ATTENDED') AS attended
    FROM event_registrations WHERE isDeleted = 0 AND ${at('locationId')} AND createdAt >= :fromMonth GROUP BY m`,
    { fromMonth },
  )
  const topEvents = await q<{ title: string; capacity: number | null; seats: number; startDate: string }>(
    `
    SELECT e.title, e.maxCapacity AS capacity, e.startDate,
      COALESCE(SUM(CASE WHEN r.status <> 'CANCELLED' THEN COALESCE(r.seatCount, 1) END), 0) AS seats
    FROM events e LEFT JOIN event_registrations r ON r.eventId = e.id AND r.isDeleted = 0
    WHERE e.isDeleted = 0 AND ${at('e.locationId')} AND e.startDate >= :fromMonth
    GROUP BY e.id, e.title, e.maxCapacity, e.startDate HAVING seats > 0 ORDER BY seats DESC LIMIT 6`,
    { fromMonth },
  )
  const requests = await q<{ k: string; n: number }>(`
    SELECT status AS k, COUNT(*) AS n FROM event_requests
    WHERE isDeleted = 0 AND ${at('locationId')} GROUP BY k`)
  const amenities = await q<{ name: string; bookings: number; revenue: number }>(
    `
    SELECT a.name, COUNT(*) AS bookings, COALESCE(SUM(b.chargeAmount), 0) AS revenue
    FROM amenity_slot_bookings b
    JOIN amenity_slot_configs c ON c.id = b.slotConfigId
    JOIN property_amenities pa ON pa.id = c.propertyAmenityId AND ${at('pa.propertyId')}
    JOIN amenities a ON a.id = pa.amenityId
    WHERE b.isDeleted = 0 AND b.status = 'BOOKED' AND b.date >= :from30
    GROUP BY a.id, a.name ORDER BY bookings DESC LIMIT 8`,
    { from30 },
  )
  const [amenityMonth] = await q(
    `
    SELECT COUNT(*) AS n, COALESCE(SUM(b.chargeAmount), 0) AS revenue FROM amenity_slot_bookings b
    JOIN amenity_slot_configs c ON c.id = b.slotConfigId
    JOIN property_amenities pa ON pa.id = c.propertyAmenityId AND ${at('pa.propertyId')}
    WHERE b.isDeleted = 0 AND b.status = 'BOOKED' AND DATE_FORMAT(b.date, '%Y-%m') = :thisMonth`,
    { thisMonth },
  )
  const heldBy = monthMap(held)
  return {
    upcoming: num(totals?.upcoming),
    thisMonth: num(totals?.thisMonth),
    seatsBookedThisMonth: num(regs?.seatsThisMonth),
    attendanceRate: pct(num(regs?.pastAttended), num(regs?.pastBooked)),
    openRequests: countOf(requests, 'OPEN') + countOf(requests, 'IN_PROGRESS'),
    amenityBookingsThisMonth: num(amenityMonth?.n),
    amenityRevenueThisMonth: num(amenityMonth?.revenue),
    byType: { regular: num(totals?.regular), special: num(totals?.special) },
    monthly: months.map((m) => {
      const s = seats.find((r) => String(r.m) === m)
      return { month: m, events: heldBy.get(m) ?? 0, booked: num(s?.booked), attended: num(s?.attended) }
    }),
    registrationStatus: pairs(regStatus),
    topEvents: topEvents.map((e) => ({
      title: e.title,
      capacity: e.capacity == null ? null : num(e.capacity),
      seats: num(e.seats),
      startDate: e.startDate,
    })),
    requestStatus: pairs(requests),
    amenities: amenities.map((a) => ({ name: a.name, bookings: num(a.bookings), revenue: num(a.revenue) })),
  }
}

// ── Medical & care ───────────────────────────────────────────────────────────
async function medical({ at, q, days, months, today, fromDay, fromMonth, thisMonth }: Ctx) {
  const from30 = daysAgo(29)
  const from90 = daysAgo(89)
  const [appts] = await q(
    `
    SELECT SUM(DATE_FORMAT(appointmentDate, '%Y-%m') = :thisMonth) AS thisMonth,
      SUM(appointmentDate <= :today AND status = 'ATTENDED' AND appointmentDate >= :from30) AS attended,
      SUM(appointmentDate <= :today AND status IN ('ATTENDED','NO_SHOW','CONFIRMED') AND appointmentDate >= :from30) AS due,
      SUM(appointmentDate >= :today AND status IN ('PENDING','CONFIRMED')) AS upcoming
    FROM doctor_appointments WHERE isDeleted = 0 AND ${at('locationId')}`,
    { thisMonth, today, from30 },
  )
  const apptMonthly = await q<{ m: string; attended: number; missed: number; other: number }>(
    `
    SELECT DATE_FORMAT(appointmentDate, '%Y-%m') AS m, SUM(status = 'ATTENDED') AS attended,
      SUM(status IN ('CANCELLED','NO_SHOW')) AS missed, SUM(status IN ('PENDING','CONFIRMED')) AS other
    FROM doctor_appointments WHERE isDeleted = 0 AND ${at('locationId')} AND appointmentDate >= :fromMonth GROUP BY m`,
    { fromMonth },
  )
  const doctors = await q<{ name: string | null; total: number; attended: number }>(
    `
    SELECT ${userNameSql('doctorId')} AS name, COUNT(*) AS total, SUM(status = 'ATTENDED') AS attended
    FROM doctor_appointments WHERE isDeleted = 0 AND ${at('locationId')} AND appointmentDate >= :fromMonth
    GROUP BY doctorId ORDER BY total DESC LIMIT 6`,
    { fromMonth },
  )
  const meds = await q<{ d: string; given: number; missed: number }>(
    `
    SELECT scheduledDate AS d, SUM(status = 'COMPLETED') AS given, SUM(status = 'CANCELLED') AS missed
    FROM resident_medication_administrations
    WHERE isDeleted = 0 AND ${at('locationId')} AND scheduledDate >= :fromDay AND scheduledDate <= :today GROUP BY d`,
    { fromDay, today },
  )
  const care = await q<{ d: string; n: number }>(
    `
    SELECT ${localDaySql('completedAt')} AS d, COUNT(*) AS n FROM resident_care_task_completions
    WHERE isDeleted = 0 AND status = 'COMPLETED' AND ${at('propertyId')} AND ${localDaySql('completedAt')} >= :fromDay
    GROUP BY d`,
    { fromDay },
  )
  const [careTotals] = await q(
    `
    SELECT
      (SELECT COUNT(*) FROM care_task_assignments
        WHERE isDeleted = 0 AND isActive = 1 AND status = 'ACTIVE' AND ${at('propertyId')}) AS active,
      (SELECT COUNT(*) FROM resident_care_task_completions WHERE isDeleted = 0 AND status = 'COMPLETED'
        AND ${at('propertyId')} AND ${localMonthSql('completedAt')} = :thisMonth) AS completedThisMonth,
      (SELECT COUNT(*) FROM resident_vitals WHERE isDeleted = 0 AND ${at('locationId')}
        AND ${localDaySql('recordedAt')} >= :from30) AS vitals30`,
    { thisMonth, from30 },
  )
  const incidentTypes = await q<{ k: string; n: number }>(
    `SELECT incidentType AS k, COUNT(*) AS n FROM resident_incidents
    WHERE isDeleted = 0 AND ${at('locationId')} AND ${localDaySql('incidentAt')} >= :from90 GROUP BY k ORDER BY n DESC`,
    { from90 },
  )
  const incidentSeverity = await q<{ k: string; n: number }>(
    `SELECT severity AS k, COUNT(*) AS n FROM resident_incidents
    WHERE isDeleted = 0 AND ${at('locationId')} AND ${localDaySql('incidentAt')} >= :from90 GROUP BY k`,
    { from90 },
  )
  const medsBy = new Map(meds.map((r) => [String(r.d).slice(0, 10), r]))
  const careBy = dayMap(care)
  const given = meds.reduce((a, r) => a + num(r.given), 0)
  const missed = meds.reduce((a, r) => a + num(r.missed), 0)
  return {
    appointmentsThisMonth: num(appts?.thisMonth),
    appointmentsUpcoming: num(appts?.upcoming),
    attendanceRate: pct(num(appts?.attended), num(appts?.due)),
    careTasksActive: num(careTotals?.active),
    careTasksCompletedThisMonth: num(careTotals?.completedThisMonth),
    vitalsLast30Days: num(careTotals?.vitals30),
    medication: { given, missed, adherence: pct(given, given + missed) },
    incidentsLast90Days: incidentTypes.reduce((a, r) => a + num(r.n), 0),
    appointmentsMonthly: months.map((m) => {
      const r = apptMonthly.find((x) => String(x.m) === m)
      return { month: m, attended: num(r?.attended), missed: num(r?.missed), scheduled: num(r?.other) }
    }),
    byDoctor: doctors.map((d) => ({ name: d.name ?? 'Unknown', total: num(d.total), attended: num(d.attended) })),
    daily: days.map((d) => ({
      day: d,
      medsGiven: num(medsBy.get(d)?.given),
      medsMissed: num(medsBy.get(d)?.missed),
      careTasks: careBy.get(d) ?? 0,
    })),
    incidentTypes: pairs(incidentTypes),
    incidentSeverity: ['critical', 'high', 'moderate', 'low'].map((s) => ({
      key: s,
      count: countOf(incidentSeverity, s),
    })),
  }
}

// ── Staff & roster ───────────────────────────────────────────────────────────
async function staff({ at, q, days, today, fromDay }: Ctx) {
  const from30 = daysAgo(29)
  const ON_DUTY = `status IN ('on_duty','completed')`
  const [headcount] = await q(`
    SELECT COUNT(DISTINCT ul.userId) AS n FROM user_locations ul
    WHERE ul.isDeleted = 0 AND ul.isActive = 1 AND ${at('ul.locId')}`)
  const byRole = await q<{ k: string; n: number }>(`
    SELECT COALESCE(r.name, 'No role') AS k, COUNT(DISTINCT ul.userId) AS n FROM user_locations ul
    LEFT JOIN roles r ON r.id = ul.roleId
    WHERE ul.isDeleted = 0 AND ul.isActive = 1 AND ${at('ul.locId')} GROUP BY k ORDER BY n DESC`)
  const byDept = await q<{ k: string; n: number }>(`
    SELECT COALESCE(d.name, 'No department') AS k, COUNT(DISTINCT ul.userId) AS n FROM user_locations ul
    LEFT JOIN departments d ON d.id = ul.departmentId
    WHERE ul.isDeleted = 0 AND ul.isActive = 1 AND ${at('ul.locId')} GROUP BY k ORDER BY n DESC`)
  const todayStatus = await q<{ k: string; n: number }>(
    `SELECT status AS k, COUNT(*) AS n FROM shift_dates
    WHERE isDeleted = 0 AND ${at('locationId')} AND date = :today GROUP BY k`,
    { today },
  )
  const byShift = await q<{ name: string; scheduled: number; onDuty: number; absent: number }>(
    `
    SELECT COALESCE(s.name, 'Unassigned') AS name, COUNT(*) AS scheduled,
      SUM(sd.status IN ('on_duty','completed')) AS onDuty, SUM(sd.status = 'absent') AS absent
    FROM shift_dates sd
    LEFT JOIN shift_assignments sa ON sa.id = sd.employeeShiftAssignmentId
    LEFT JOIN shifts s ON s.id = sa.shiftId
    WHERE sd.isDeleted = 0 AND ${at('sd.locationId')} AND sd.date = :today AND sd.status <> 'day_off'
    GROUP BY name ORDER BY MIN(s.startTime)`,
    { today },
  )
  const daily = await q<{ d: string; present: number; absent: number; covered: number }>(
    `
    SELECT date AS d, SUM(${ON_DUTY}) AS present, SUM(status = 'absent') AS absent, SUM(status = 'covered') AS covered
    FROM shift_dates WHERE isDeleted = 0 AND ${at('locationId')} AND date >= :fromDay AND date <= :today GROUP BY d`,
    { fromDay, today },
  )
  const leave = await q<{ k: string | null; n: number }>(
    `SELECT COALESCE(NULLIF(leaveType, ''), 'Not given') AS k, COUNT(*) AS n FROM shift_dates
    WHERE isDeleted = 0 AND ${at('locationId')} AND status = 'absent' AND date >= :from30 GROUP BY k ORDER BY n DESC`,
    { from30 },
  )
  const absentees = await q<{ name: string | null; n: number }>(
    `
    SELECT ${userNameSql('sa.employeeId')} AS name, COUNT(*) AS n FROM shift_dates sd
    JOIN shift_assignments sa ON sa.id = sd.employeeShiftAssignmentId
    WHERE sd.isDeleted = 0 AND ${at('sd.locationId')} AND sd.status = 'absent' AND sd.date >= :from30
    GROUP BY sa.employeeId ORDER BY n DESC LIMIT 5`,
    { from30 },
  )
  const [shifts] = await q(
    `SELECT COUNT(*) AS n FROM shifts WHERE isDeleted = 0 AND isActive = 1 AND ${at('locationId')}`,
  )
  const dailyBy = new Map(daily.map((r) => [String(r.d).slice(0, 10), r]))
  const scheduledToday = todayStatus.filter((r) => r.k !== 'day_off').reduce((a, r) => a + num(r.n), 0)
  const presentToday = countOf(todayStatus, 'on_duty') + countOf(todayStatus, 'completed')
  return {
    headcount: num(headcount?.n),
    shifts: num(shifts?.n),
    today: {
      scheduled: scheduledToday,
      present: presentToday,
      upcoming: countOf(todayStatus, 'upcoming'),
      absent: countOf(todayStatus, 'absent'),
      covered: countOf(todayStatus, 'covered'),
      dayOff: countOf(todayStatus, 'day_off'),
    },
    byRole: pairs(byRole),
    byDepartment: pairs(byDept),
    byShiftToday: byShift.map((s) => ({
      name: s.name,
      scheduled: num(s.scheduled),
      onDuty: num(s.onDuty),
      absent: num(s.absent),
    })),
    daily: days.map((d) => ({
      day: d,
      present: num(dailyBy.get(d)?.present),
      absent: num(dailyBy.get(d)?.absent),
      covered: num(dailyBy.get(d)?.covered),
    })),
    leaveTypes: pairs(leave),
    topAbsentees: absentees.map((a) => ({ name: a.name ?? 'Unknown', count: num(a.n) })),
  }
}

// ── Assets ───────────────────────────────────────────────────────────────────
async function assets({ at, q, months, today, fromMonth }: Ctx) {
  const in30 = daysAhead(30)
  const in60 = daysAhead(60)
  const in90 = daysAhead(90)
  const ASSET_JOIN = `JOIN assets a ON a.id = x.assetId AND ${at('a.locationId')}`
  const [totals] = await q(
    `
    SELECT COUNT(*) AS total, COALESCE(SUM(purchasePrice), 0) AS purchaseValue,
      COALESCE(SUM(currentValue), 0) AS currentValue,
      SUM(DATE(warrantyEndDate) < :today) AS wExpired,
      SUM(DATE(warrantyEndDate) BETWEEN :today AND :in30) AS w30,
      SUM(DATE(warrantyEndDate) > :in30 AND DATE(warrantyEndDate) <= :in60) AS w60,
      SUM(DATE(warrantyEndDate) > :in60 AND DATE(warrantyEndDate) <= :in90) AS w90,
      SUM(DATE(warrantyEndDate) > :in90) AS wLater, SUM(warrantyEndDate IS NULL) AS wNone
    FROM assets a WHERE ${at('a.locationId')} AND a.status NOT IN ('disposed')`,
    { today, in30, in60, in90 },
  )
  const status = await q<{ k: string; n: number }>(
    `SELECT status AS k, COUNT(*) AS n FROM assets a WHERE ${at('a.locationId')} GROUP BY k`,
  )
  const condition = await q<{ k: string; n: number }>(
    `SELECT COALESCE(\`condition\`, 'unknown') AS k, COUNT(*) AS n FROM assets a
    WHERE ${at('a.locationId')} AND a.status NOT IN ('disposed','retired') GROUP BY k`,
  )
  const categories = await q<{ name: string; n: number; value: number }>(`
    SELECT COALESCE(c.name, 'Uncategorised') AS name, COUNT(*) AS n, COALESCE(SUM(a.currentValue), 0) AS value
    FROM assets a LEFT JOIN asset_items i ON i.id = a.itemId LEFT JOIN asset_categories c ON c.id = i.categoryId
    WHERE ${at('a.locationId')} AND a.status NOT IN ('disposed') GROUP BY name ORDER BY n DESC LIMIT 8`)
  const [due] = await q(
    `
    SELECT
      (SELECT COUNT(*) FROM asset_service_logs x ${ASSET_JOIN}
        WHERE x.completionStatus = 'pending' AND DATE(x.serviceDate) < :today) AS servicesOverdue,
      (SELECT COUNT(*) FROM asset_service_logs x ${ASSET_JOIN}
        WHERE x.completionStatus = 'pending' AND DATE(x.serviceDate) BETWEEN :today AND :in30) AS servicesDue,
      (SELECT COUNT(*) FROM asset_compliance_certifications x ${ASSET_JOIN}
        WHERE DATE(x.expiryDate) BETWEEN :today AND :in60) AS certsExpiring,
      (SELECT COUNT(*) FROM asset_compliance_certifications x ${ASSET_JOIN}
        WHERE DATE(x.expiryDate) < :today) AS certsExpired,
      (SELECT COUNT(*) FROM asset_compliance_inspections x ${ASSET_JOIN}
        WHERE x.result = 'fail' AND x.inspectionDate >= :from365) AS inspectionsFailed`,
    { today, in30, in60, from365: daysAgo(364) },
  )
  const cost = await q<{ m: string; n: number }>(
    `SELECT DATE_FORMAT(x.serviceDate, '%Y-%m') AS m, SUM(x.cost) AS n FROM asset_service_logs x ${ASSET_JOIN}
    WHERE x.serviceDate >= :fromMonth GROUP BY m`,
    { fromMonth },
  )
  const serviceTypes = await q<{ k: string; n: number }>(
    `SELECT x.serviceType AS k, COUNT(*) AS n FROM asset_service_logs x ${ASSET_JOIN}
    WHERE x.serviceDate >= :fromMonth GROUP BY k ORDER BY n DESC`,
    { fromMonth },
  )
  const upcoming = await q<{ kind: string; asset: string; at: string }>(
    `
    (SELECT 'service' AS kind, COALESCE(a.assetTag, a.serialNumber, 'Asset') AS asset, x.serviceDate AS at
      FROM asset_service_logs x ${ASSET_JOIN} WHERE x.completionStatus = 'pending' AND DATE(x.serviceDate) <= :in60)
    UNION ALL
    (SELECT 'inspection', COALESCE(a.assetTag, a.serialNumber, 'Asset'), x.nextInspectionDate
      FROM asset_compliance_inspections x ${ASSET_JOIN}
      WHERE x.nextInspectionDate IS NOT NULL AND DATE(x.nextInspectionDate) <= :in60)
    UNION ALL
    (SELECT 'certificate', COALESCE(a.assetTag, a.serialNumber, 'Asset'), x.expiryDate
      FROM asset_compliance_certifications x ${ASSET_JOIN} WHERE DATE(x.expiryDate) <= :in60)
    UNION ALL
    (SELECT 'warranty', COALESCE(a.assetTag, a.serialNumber, 'Asset'), a.warrantyEndDate
      FROM assets a WHERE ${at('a.locationId')} AND a.status NOT IN ('disposed','retired')
        AND DATE(a.warrantyEndDate) BETWEEN :today AND :in60)
    ORDER BY at ASC LIMIT 8`,
    { today, in60 },
  )
  const costBy = monthMap(cost)
  return {
    total: num(totals?.total),
    purchaseValue: num(totals?.purchaseValue),
    currentValue: num(totals?.currentValue),
    inMaintenance: countOf(status, 'maintenance'),
    servicesOverdue: num(due?.servicesOverdue),
    servicesDueSoon: num(due?.servicesDue),
    certificatesExpiring: num(due?.certsExpiring),
    certificatesExpired: num(due?.certsExpired),
    inspectionsFailed: num(due?.inspectionsFailed),
    status: pairs(status),
    condition: pairs(condition),
    byCategory: categories.map((c) => ({ name: c.name, count: num(c.n), value: num(c.value) })),
    warranty: {
      expired: num(totals?.wExpired),
      within30: num(totals?.w30),
      within60: num(totals?.w60),
      within90: num(totals?.w90),
      later: num(totals?.wLater),
      none: num(totals?.wNone),
    },
    maintenanceCost: months.map((m) => ({ month: m, cost: costBy.get(m) ?? 0 })),
    serviceTypes: pairs(serviceTypes),
    upcoming: upcoming.map((u) => ({ kind: u.kind, asset: u.asset, at: u.at })),
  }
}

// ── Feedback ─────────────────────────────────────────────────────────────────
async function feedback({ at, q, months, fromMonth }: Ctx) {
  const SENT = `f.isDeleted = 0 AND f.status = 'SENT' AND ${at('f.locationId')}`
  const RATING = `ans.ratingValue * 5 / NULLIF(COALESCE(qq.ratingScale, 5), 0)`
  const [totals] = await q(`
    SELECT COUNT(DISTINCT f.id) AS forms,
      COUNT(DISTINCT CASE WHEN f.expiryDate IS NULL OR f.expiryDate >= UTC_TIMESTAMP() THEN f.id END) AS active,
      COUNT(r.id) AS recipients, SUM(r.status = 'SUBMITTED') AS submitted
    FROM feedback_forms f LEFT JOIN feedback_form_recipients r ON r.formId = f.id
    WHERE ${SENT}`)
  const [avg] = await q(`
    SELECT AVG(${RATING}) AS score, COUNT(*) AS n FROM feedback_answers ans
    JOIN feedback_questions qq ON qq.id = ans.questionId AND qq.answerType = 'RATING'
    JOIN feedback_forms f ON f.id = qq.formId AND ${SENT}
    WHERE ans.ratingValue IS NOT NULL`)
  const dist = await q<{ k: number; n: number }>(`
    SELECT LEAST(5, GREATEST(1, ROUND(${RATING}))) AS k, COUNT(*) AS n FROM feedback_answers ans
    JOIN feedback_questions qq ON qq.id = ans.questionId AND qq.answerType = 'RATING'
    JOIN feedback_forms f ON f.id = qq.formId AND ${SENT}
    WHERE ans.ratingValue IS NOT NULL GROUP BY k`)
  const forms = await q<{ title: string; sentAt: string | null; recipients: number; submitted: number }>(`
    SELECT f.title, f.sentAt, COUNT(r.id) AS recipients, SUM(r.status = 'SUBMITTED') AS submitted
    FROM feedback_forms f LEFT JOIN feedback_form_recipients r ON r.formId = f.id
    WHERE ${SENT} GROUP BY f.id, f.title, f.sentAt ORDER BY f.sentAt DESC LIMIT 8`)
  const formScores = await q<{ title: string; score: number }>(`
    SELECT f.title, AVG(${RATING}) AS score FROM feedback_answers ans
    JOIN feedback_questions qq ON qq.id = ans.questionId AND qq.answerType = 'RATING'
    JOIN feedback_forms f ON f.id = qq.formId AND ${SENT}
    WHERE ans.ratingValue IS NOT NULL GROUP BY f.id, f.title`)
  const audience = await q<{ k: string; recipients: number; submitted: number }>(`
    SELECT r.recipientType AS k, COUNT(*) AS recipients, SUM(r.status = 'SUBMITTED') AS submitted
    FROM feedback_form_recipients r JOIN feedback_forms f ON f.id = r.formId AND ${SENT} GROUP BY k`)
  const monthly = await q<{ m: string; n: number }>(
    `
    SELECT ${localMonthSql('r.submittedAt')} AS m, COUNT(*) AS n FROM feedback_form_recipients r
    JOIN feedback_forms f ON f.id = r.formId AND ${SENT}
    WHERE r.status = 'SUBMITTED' AND r.submittedAt >= :fromMonth GROUP BY m`,
    { fromMonth },
  )
  const monthlyBy = monthMap(monthly)
  const scoreBy = new Map(formScores.map((f) => [f.title, round1(num(f.score))]))
  return {
    formsSent: num(totals?.forms),
    activeForms: num(totals?.active),
    recipients: num(totals?.recipients),
    responses: num(totals?.submitted),
    responseRate: pct(num(totals?.submitted), num(totals?.recipients)),
    averageRating: round1(num(avg?.score)),
    ratingsCount: num(avg?.n),
    ratingDistribution: [5, 4, 3, 2, 1].map((s) => ({ stars: s, count: num(dist.find((d) => num(d.k) === s)?.n) })),
    forms: forms.map((f) => ({
      title: f.title,
      sentAt: f.sentAt,
      recipients: num(f.recipients),
      responses: num(f.submitted),
      responseRate: pct(num(f.submitted), num(f.recipients)),
      averageRating: scoreBy.get(f.title) ?? null,
    })),
    byAudience: audience.map((a) => ({
      key: a.k,
      recipients: num(a.recipients),
      responses: num(a.submitted),
      responseRate: pct(num(a.submitted), num(a.recipients)),
    })),
    monthly: months.map((m) => ({ month: m, responses: monthlyBy.get(m) ?? 0 })),
  }
}

const BUILDERS: Record<AnalyticsTab, (ctx: Ctx) => Promise<unknown>> = {
  tickets,
  visitors,
  dining,
  events,
  medical,
  staff,
  assets,
  feedback,
}

export async function getDashboardAnalytics(req: Request, res: Response): Promise<void> {
  const tab = req.params.tab as AnalyticsTab
  if (!(ANALYTICS_TABS as readonly string[]).includes(tab)) {
    res.status(404).json({ success: false, message: `Unknown dashboard tab: ${tab}` })
    return
  }
  try {
    const rawLoc = (req.params.locationId || req.query.locationId) as string | undefined
    const loc = rawLoc && rawLoc !== 'ALL' ? rawLoc : null
    const days = lastDays(TREND_DAYS)
    const months = lastMonths(TREND_MONTHS)
    const ctx: Ctx = {
      ...scopedQuery(loc),
      days,
      months,
      today: days[days.length - 1]!,
      thisMonth: months[months.length - 1]!,
      fromDay: days[0]!,
      fromMonth: `${months[0]!}-01`,
    }
    const data = await BUILDERS[tab](ctx)
    res.status(200).json({ success: true, data: { generatedAt: new Date().toISOString(), tab, ...(data as object) } })
  } catch (err: unknown) {
    console.error(`Dashboard analytics (${tab}) error:`, err)
    const message = err instanceof Error ? err.message : 'Failed to fetch dashboard analytics'
    res.status(500).json({ success: false, message })
  }
}
