import type { Request, Response } from 'express'
import { QueryTypes } from 'sequelize'
import sequelize from '../../config/db/index.js'
import { PropertyUnit, Resident } from '../../models/index.js'
import { CareLevel, ResidentStatus } from '../../enums/resident.enum.js'

/**
 * Dashboard statistics for one property (or every property when no location / 'ALL' is given).
 * Every number comes from the database; nothing is filled in. Series are in local (IST) time.
 */

/** Local time offset: DATETIME columns are stored in UTC. */
const OFFSET_MIN = Number(process.env.BILLING_TZ_OFFSET_MINUTES ?? 330)
const TREND_DAYS = 14
const TREND_MONTHS = 6

type Row = Record<string, unknown>

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const round1 = (v: number) => Math.round(v * 10) / 10
const pct = (part: number, whole: number) => (whole > 0 ? round1((part / whole) * 100) : 0)

/** Local calendar day / month keys. */
const localNow = () => new Date(Date.now() + OFFSET_MIN * 60_000)
const dayKey = (d: Date) => d.toISOString().slice(0, 10)
const lastDays = (n: number) => {
  const today = localNow()
  return Array.from({ length: n }, (_, i) => dayKey(new Date(today.getTime() - (n - 1 - i) * 86_400_000)))
}
const lastMonths = (n: number) => {
  const now = localNow()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1 - i), 1))
    return d.toISOString().slice(0, 7)
  })
}
/** SQL for a DATETIME column as a local day / month. */
const localDaySql = (col: string) => `DATE(${col} + INTERVAL ${OFFSET_MIN} MINUTE)`
const localMonthSql = (col: string) => `DATE_FORMAT(${col} + INTERVAL ${OFFSET_MIN} MINUTE, '%Y-%m')`

export async function getDashboardStats(req: Request, res: Response): Promise<void> {
  try {
    const rawLoc = (req.params.locationId || req.query.locationId) as string | undefined
    const loc = rawLoc && rawLoc !== 'ALL' ? rawLoc : null
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1)
    const limit = Math.max(1, parseInt(req.query.limit as string, 10) || 6)

    /** `col = :loc`, or no filter for all properties. */
    const at = (col: string) => (loc ? `${col} = :loc` : '1=1')
    const q = <T extends Row = Row>(sql: string, extra: Record<string, unknown> = {}) =>
      sequelize.query<T>(sql, { replacements: { loc, ...extra }, type: QueryTypes.SELECT })

    const days = lastDays(TREND_DAYS)
    const months = lastMonths(TREND_MONTHS)
    const today = days[days.length - 1]!
    const thisMonth = months[months.length - 1]!
    const fromDay = days[0]!
    const fromMonth = `${months[0]!}-01`

    // ── Residents ──────────────────────────────────────────────────────────────
    const [residentCounts] = await q(
      `
      SELECT
        SUM(status = '${ResidentStatus.ACTIVE}' AND isResiding = 1) AS residing,
        COUNT(*) AS total,
        SUM(status = '${ResidentStatus.PENDING}') AS pending,
        SUM(status = '${ResidentStatus.MOVED_OUT}') AS movedOut,
        SUM(status = '${ResidentStatus.ACTIVE}' AND isResiding = 0) AS away,
        SUM(status = '${ResidentStatus.ACTIVE}' AND isResiding = 1 AND (careLevel = '${CareLevel.STABLE}' OR careLevel IS NULL)) AS stable,
        SUM(status = '${ResidentStatus.ACTIVE}' AND isResiding = 1 AND careLevel = '${CareLevel.MODERATE}') AS moderate,
        SUM(status = '${ResidentStatus.ACTIVE}' AND isResiding = 1 AND careLevel = '${CareLevel.CRITICAL}') AS critical,
        SUM(DATE(moveInDate) = :today) AS movedInToday,
        SUM(DATE(moveOutDate) = :today) AS movedOutToday
      FROM residents WHERE isDeleted = 0 AND ${at('locId')}`,
      { today },
    )
    const [familyCounts] = await q(`
      SELECT COUNT(*) AS residing FROM resident_family_members f
      JOIN residents r ON r.id = f.residentId AND r.isDeleted = 0 AND r.isResiding = 1 AND ${at('r.locId')}
      WHERE f.isDeleted = 0 AND f.isResiding = 1`)

    const criticalWhere: Record<string, unknown> = {
      isDeleted: false,
      status: ResidentStatus.ACTIVE,
      careLevel: CareLevel.CRITICAL,
    }
    if (loc) criticalWhere.locId = loc
    const { count: criticalCount, rows: criticalRows } = await Resident.findAndCountAll({
      where: criticalWhere,
      include: [{ model: PropertyUnit, as: 'unit', required: false, attributes: ['unit_number'] }],
      order: [['updatedAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    })

    // ── Tickets ────────────────────────────────────────────────────────────────
    const ticketStatus = await q<{ status: string; n: number }>(
      `SELECT status, COUNT(*) AS n FROM tickets WHERE ${at('locId')} GROUP BY status`,
    )
    const ticketPriority = await q<{ priority: string; n: number }>(`
      SELECT priority, COUNT(*) AS n FROM tickets
      WHERE ${at('locId')} AND status IN ('OPEN','IN_PROGRESS','ON_HOLD') GROUP BY priority`)
    const ticketsCreated = await q<{ d: string; n: number }>(
      `
      SELECT ${localDaySql('createdAt')} AS d, COUNT(*) AS n FROM tickets
      WHERE ${at('locId')} AND ${localDaySql('createdAt')} >= :fromDay GROUP BY d`,
      { fromDay },
    )
    const ticketsResolved = await q<{ d: string; n: number }>(
      `
      SELECT ${localDaySql('COALESCE(resolvedAt, closedAt)')} AS d, COUNT(*) AS n FROM tickets
      WHERE ${at('locId')} AND status IN ('RESOLVED','CLOSED') AND COALESCE(resolvedAt, closedAt) IS NOT NULL
        AND ${localDaySql('COALESCE(resolvedAt, closedAt)')} >= :fromDay GROUP BY d`,
      { fromDay },
    )
    const ticketByStatus = (s: string) => num(ticketStatus.find((r) => r.status === s)?.n)
    const tickets = {
      open: ticketByStatus('OPEN'),
      inProgress: ticketByStatus('IN_PROGRESS'),
      onHold: ticketByStatus('ON_HOLD'),
      resolved: ticketByStatus('RESOLVED'),
      closed: ticketByStatus('CLOSED'),
      cancelled: ticketByStatus('CANCELLED'),
    }
    const ticketTotal = Object.values(tickets).reduce((a, b) => a + b, 0)
    const ticketDone = tickets.resolved + tickets.closed
    const ticketCounted = ticketTotal - tickets.cancelled
    const dayMap = (rows: { d: string; n: number }[]) => new Map(rows.map((r) => [String(r.d).slice(0, 10), num(r.n)]))
    const createdByDay = dayMap(ticketsCreated)
    const resolvedByDay = dayMap(ticketsResolved)

    const feedback = await q<{ rating: string; n: number }>(`
      SELECT f.rating, COUNT(*) AS n FROM ticket_feedbacks f
      JOIN tickets t ON t.id = f.ticketId AND ${at('t.locId')} GROUP BY f.rating`)
    const fb = (r: string) => num(feedback.find((x) => x.rating === r)?.n)
    const fbGood = fb('GOOD')
    const fbAverage = fb('AVERAGE')
    const fbPoor = fb('POOR')
    const fbTotal = fbGood + fbAverage + fbPoor

    // ── Visitors (gate) ───────────────────────────────────────────────────────
    const visitorTypes = await q<{ t: string; n: number }>(
      `
      SELECT visitorType AS t, SUM(COALESCE(numberOfPeople, 1)) AS n FROM gate_entries
      WHERE ${at('locId')} AND ${localDaySql('createdAt')} >= :from30 GROUP BY visitorType`,
      { from30: dayKey(new Date(localNow().getTime() - 29 * 86_400_000)) },
    )
    const visitorDays = await q<{ d: string; n: number }>(
      `
      SELECT ${localDaySql('createdAt')} AS d, SUM(COALESCE(numberOfPeople, 1)) AS n FROM gate_entries
      WHERE ${at('locId')} AND ${localDaySql('createdAt')} >= :fromDay GROUP BY d`,
      { fromDay },
    )
    const [visitorNow] = await q(`
      SELECT SUM(status = 'Inside') AS inside, SUM(status = 'PendingApproval') AS awaiting
      FROM gate_entries WHERE ${at('locId')}`)
    const visitorsByDay = dayMap(visitorDays)

    // ── Staff ─────────────────────────────────────────────────────────────────
    const staffRows = await q<{ code: string; name: string; role: string | null; n: number }>(`
      SELECT d.code, d.name, r.name AS role, COUNT(DISTINCT ul.userId) AS n
      FROM user_locations ul
      JOIN departments d ON d.id = ul.departmentId
      LEFT JOIN roles r ON r.id = ul.roleId
      WHERE ul.isDeleted = 0 AND ul.isActive = 1 AND ${at('ul.locId')}
      GROUP BY d.code, d.name, r.name`)
    const byDept = new Map<string, { code: string; name: string; count: number }>()
    let doctors = 0
    let medicalOthers = 0
    for (const r of staffRows) {
      const d = byDept.get(r.code) ?? { code: r.code, name: r.name, count: 0 }
      d.count += num(r.n)
      byDept.set(r.code, d)
      if (r.code === 'MED') {
        if (/doctor|physician/i.test(r.role ?? '')) doctors += num(r.n)
        else medicalOthers += num(r.n)
      }
    }
    const staffByDepartment = [...byDept.values()].sort((a, b) => b.count - a.count)

    // ── Medical ───────────────────────────────────────────────────────────────
    const [apptToday] = await q(
      `
      SELECT COUNT(*) AS total,
        SUM(status = 'ATTENDED') AS completed,
        SUM(status IN ('PENDING','CONFIRMED')) AS upcoming,
        SUM(status IN ('CANCELLED','NO_SHOW')) AS missed
      FROM doctor_appointments WHERE isDeleted = 0 AND ${at('locationId')} AND appointmentDate = :today`,
      { today },
    )
    const apptDays = await q<{ d: string; n: number }>(
      `
      SELECT DATE(appointmentDate) AS d, COUNT(*) AS n FROM doctor_appointments
      WHERE isDeleted = 0 AND ${at('locationId')} AND appointmentDate >= :fromDay AND appointmentDate <= :today
        AND status <> 'CANCELLED' GROUP BY d`,
      { fromDay, today },
    )
    const apptsByDay = dayMap(apptDays)
    const [care] = await q(
      `
      SELECT
        (SELECT COUNT(*) FROM care_task_assignments
          WHERE isDeleted = 0 AND isActive = 1 AND status = 'ACTIVE' AND ${at('propertyId')}) AS active,
        (SELECT COUNT(*) FROM resident_care_task_completions
          WHERE isDeleted = 0 AND ${at('propertyId')} AND ${localDaySql('completedAt')} = :today) AS completedToday`,
      { today },
    )

    // ── Events & dining ───────────────────────────────────────────────────────
    const [events] = await q(
      `
      SELECT COUNT(*) AS total,
        SUM(endDate >= UTC_TIMESTAMP()) AS upcoming,
        SUM(${localDaySql('startDate')} <= :today AND ${localDaySql('endDate')} >= :today) AS today,
        SUM(${localMonthSql('startDate')} = :thisMonth) AS thisMonth
      FROM events WHERE isDeleted = 0 AND ${at('locationId')}`,
      { today, thisMonth },
    )
    const [eventRegs] = await q(
      `
      SELECT SUM(COALESCE(seatCount, 1)) AS seats, SUM(status = 'ATTENDED') AS attended
      FROM event_registrations
      WHERE isDeleted = 0 AND status <> 'CANCELLED' AND ${at('locationId')}
        AND ${localMonthSql('createdAt')} = :thisMonth`,
      { thisMonth },
    )
    const [dining] = await q(
      `
      SELECT COUNT(*) AS orders,
        SUM(serviceType = 'dine_in') AS dineIn,
        SUM(serviceType <> 'dine_in') AS roomService,
        SUM(orderStatus IN ('completed','delivered')) AS completed
      FROM fnb_resident_orders WHERE ${at('locId')} AND DATE(date) = :today`,
      { today },
    )
    const [dineInAttendance] = await q(
      `SELECT SUM(CASE WHEN is_guest = 1 THEN COALESCE(guest_count, 1) ELSE 1 END) AS n FROM fnb_food_attendances
      WHERE ${at('loc_id')} AND DATE(date) = :today AND status = 'attended'`,
      { today },
    )

    // ── Occupancy ─────────────────────────────────────────────────────────────
    const unitJoin = `
      FROM property_units u
      JOIN property_floors f ON f.id = u.floorId AND f.isDeleted = 0
      JOIN property_blocks b ON b.id = f.blockId AND b.isDeleted = 0 AND ${at('b.propertyId')}
      WHERE u.isDeleted = 0`
    const [units] = await q(`
      SELECT COUNT(*) AS total,
        SUM(u.occupancyStatus = 'OWNER_OCCUPIED') AS owner,
        SUM(u.occupancyStatus = 'TENANT_OCCUPIED') AS tenant,
        SUM(COALESCE(u.occupancyStatus, 'VACANT') = 'VACANT') AS vacant,
        SUM(COALESCE(u.occupancyStatus, 'VACANT') = 'VACANT' AND u.status IN ('booked','on_hold')) AS booked,
        COUNT(DISTINCT b.id) AS blocks, COUNT(DISTINCT f.id) AS floors
      ${unitJoin}`)
    const unitTypes = await q<{ t: string | null; total: number; occupied: number }>(`
      SELECT UPPER(COALESCE(NULLIF(u.unit_type, ''), 'Other')) AS t, COUNT(*) AS total,
        SUM(u.occupancyStatus IN ('OWNER_OCCUPIED','TENANT_OCCUPIED')) AS occupied
      ${unitJoin} GROUP BY t ORDER BY total DESC`)
    const blocks = await q<{ name: string; total: number; occupied: number }>(`
      SELECT b.block_name AS name, COUNT(*) AS total,
        SUM(u.occupancyStatus IN ('OWNER_OCCUPIED','TENANT_OCCUPIED')) AS occupied
      ${unitJoin} GROUP BY b.id, b.block_name, b.sort_order ORDER BY b.sort_order, b.block_name`)
    const moveIns = await q<{ m: string; n: number }>(
      `
      SELECT DATE_FORMAT(moveInDate, '%Y-%m') AS m, COUNT(*) AS n FROM residents
      WHERE isDeleted = 0 AND ${at('locId')} AND moveInDate >= :fromMonth GROUP BY m`,
      { fromMonth },
    )
    const moveOuts = await q<{ m: string; n: number }>(
      `
      SELECT DATE_FORMAT(moveOutDate, '%Y-%m') AS m, COUNT(*) AS n FROM residents
      WHERE isDeleted = 0 AND ${at('locId')} AND moveOutDate >= :fromMonth GROUP BY m`,
      { fromMonth },
    )
    const monthMap = (rows: { m: string; n: number }[]) => new Map(rows.map((r) => [String(r.m), num(r.n)]))
    const moveInByMonth = monthMap(moveIns)
    const moveOutByMonth = monthMap(moveOuts)
    const totalUnits = num(units?.total)
    const occupiedUnits = num(units?.owner) + num(units?.tenant)

    // ── Billing ───────────────────────────────────────────────────────────────
    const [inv] = await q(`
      SELECT COUNT(*) AS n,
        SUM(discountedAmount - COALESCE(carriedForwardAmount, 0)) AS billed,
        SUM(CASE WHEN status IN ('PENDING','PARTIALLY_PAID','OVERDUE') THEN remainingBalance ELSE 0 END) AS outstanding,
        SUM(CASE WHEN status = 'OVERDUE' THEN remainingBalance ELSE 0 END) AS overdue,
        SUM(status = 'DRAFT') AS draft, SUM(status = 'PENDING') AS pending,
        SUM(status = 'PARTIALLY_PAID') AS partiallyPaid, SUM(status = 'PAID') AS paid,
        SUM(status = 'OVERDUE') AS overdueCount, SUM(status IN ('OBSOLETE','CARRY_FORWARDED')) AS carried
      FROM invoices WHERE isDeleted = 0 AND status <> 'CANCELLED' AND ${at('propertyId')}`)
    const receiptJoin = `FROM receipts rc JOIN invoices i ON i.id = rc.invoiceId AND ${at('i.propertyId')}
      WHERE rc.isDeleted = 0`
    const [collectedRow] = await q(`SELECT SUM(rc.paidAmount) AS amount, COUNT(*) AS n ${receiptJoin}`)
    const billedMonthly = await q<{ m: string; n: number }>(
      `
      SELECT DATE_FORMAT(startDate, '%Y-%m') AS m, SUM(discountedAmount - COALESCE(carriedForwardAmount, 0)) AS n
      FROM invoices WHERE isDeleted = 0 AND status <> 'CANCELLED' AND ${at('propertyId')} AND startDate >= :fromMonth
      GROUP BY m`,
      { fromMonth },
    )
    const collectedMonthly = await q<{ m: string; n: number }>(
      `
      SELECT ${localMonthSql('rc.createdAt')} AS m, SUM(rc.paidAmount) AS n ${receiptJoin}
        AND rc.createdAt >= :fromMonth GROUP BY m`,
      { fromMonth },
    )
    const paymentMethods = await q<{ method: string; amount: number; n: number }>(`
      SELECT COALESCE(rc.paymentMethod, 'OTHER') AS method, SUM(rc.paidAmount) AS amount, COUNT(*) AS n
      ${receiptJoin} GROUP BY method ORDER BY amount DESC`)
    const topOutstanding = await q<{ unit: string | null; name: string | null; due: number; invoices: number }>(`
      SELECT COALESCE(pu.unit_number, i.billToUnitNumber) AS unit, MAX(i.billToName) AS name,
        SUM(i.remainingBalance) AS due, COUNT(*) AS invoices
      FROM invoices i LEFT JOIN property_units pu ON pu.id = i.unitId
      WHERE i.isDeleted = 0 AND i.status IN ('PENDING','PARTIALLY_PAID','OVERDUE') AND ${at('i.propertyId')}
      GROUP BY i.unitId, unit HAVING due > 0 ORDER BY due DESC LIMIT 5`)
    const [subs] = await q(`
      SELECT
        (SELECT COUNT(*) FROM package_subscriptions
          WHERE isDeleted = 0 AND status = 'ACTIVE' AND ${at('propertyId')}) AS care,
        (SELECT COALESCE(SUM(totalCost), 0) FROM package_subscriptions
          WHERE isDeleted = 0 AND status = 'ACTIVE' AND ${at('propertyId')}) AS careValue,
        (SELECT COUNT(*) FROM fnb_resident_packages p JOIN residents r ON r.id = p.residentId AND ${at('r.locId')}
          WHERE p.status = 'active') AS food,
        (SELECT COALESCE(SUM(p.totalPrice), 0) FROM fnb_resident_packages p
          JOIN residents r ON r.id = p.residentId AND ${at('r.locId')} WHERE p.status = 'active') AS foodValue`)
    const billed = num(inv?.billed)
    const collected = num(collectedRow?.amount)
    const billedByMonth = monthMap(billedMonthly)
    const collectedByMonth = monthMap(collectedMonthly)

    // ── Inventory ─────────────────────────────────────────────────────────────
    const [invTotals] = await q(`
      SELECT
        (SELECT COUNT(*) FROM inventory_item_locations WHERE ${at('locationId')}) AS items,
        (SELECT COUNT(*) FROM inventory_category_locations WHERE ${at('locationId')}) AS categories,
        (SELECT COUNT(*) FROM inventory_vendor_locations WHERE ${at('locationId')}) AS suppliers,
        (SELECT COALESCE(SUM(quantity), 0) FROM inventory_stock WHERE ${at('locationId')}) AS units,
        (SELECT COUNT(*) FROM inventory_purchase_orders WHERE ${at('locationId')}) AS poTotal`)
    // Stock per tracked item, against its reorder threshold (property threshold, else the item's).
    const stock = await q<{ name: string; category: string | null; quantity: number; threshold: number }>(`
      SELECT it.name, c.name AS category, COALESCE(SUM(s.quantity), 0) AS quantity,
        COALESCE(MAX(il.threshold), MAX(it.threshold), 0) AS threshold
      FROM inventory_item_locations il
      JOIN inventory_items it ON it.id = il.itemId
      LEFT JOIN inventory_categories c ON c.id = it.categoryId
      LEFT JOIN inventory_stock s ON s.itemId = il.itemId AND s.locationId = il.locationId
      WHERE ${at('il.locationId')}
      GROUP BY il.itemId, it.name, c.name`)
    const poStatus = await q<{ status: string; n: number }>(
      `SELECT status, COUNT(*) AS n FROM inventory_purchase_orders WHERE ${at('locationId')} GROUP BY status`,
    )
    const invMonthly = await q<{ m: string; t: string; n: number }>(
      `
      SELECT DATE_FORMAT(t.date, '%Y-%m') AS m, t.transactionType AS t, SUM(l.quantity) AS n
      FROM inventory_stock_transactions t
      JOIN inventory_stock_transaction_lines l ON l.transactionId = t.id
      WHERE ${at('t.locationId')} AND t.date >= :fromMonth GROUP BY m, t.transactionType`,
      { fromMonth },
    )
    const inStock = stock.filter((s) => num(s.quantity) > 0)
    const outOfStock = stock.filter((s) => num(s.quantity) <= 0)
    const lowStock = stock
      .filter((s) => num(s.threshold) > 0 && num(s.quantity) <= num(s.threshold))
      .sort((a, b) => num(a.quantity) - num(b.quantity))
    const categoryStock = new Map<string, { category: string; items: number; quantity: number }>()
    for (const s of stock) {
      const key = s.category || 'Uncategorised'
      const c = categoryStock.get(key) ?? { category: key, items: 0, quantity: 0 }
      c.items++
      c.quantity += num(s.quantity)
      categoryStock.set(key, c)
    }
    const invByMonth = (type: string[]) =>
      months.map((m) =>
        invMonthly.filter((r) => String(r.m) === m && type.includes(String(r.t))).reduce((a, r) => a + num(r.n), 0),
      )
    const issued = invByMonth(['issue'])
    const received = invByMonth(['purchase', 'receipt', 'grn'])

    // ── Recent activity ───────────────────────────────────────────────────────
    const activity = await q<{ type: string; title: string; detail: string | null; at: string }>(`
      (SELECT 'ticket' AS type, CONCAT('Ticket ', ticketNumber, ' raised') AS title, title AS detail, createdAt AS at
        FROM tickets WHERE ${at('locId')} ORDER BY createdAt DESC LIMIT 5)
      UNION ALL
      (SELECT 'ticket_resolved', CONCAT('Ticket ', ticketNumber, ' resolved'), title, COALESCE(resolvedAt, closedAt)
        FROM tickets WHERE ${at('locId')} AND COALESCE(resolvedAt, closedAt) IS NOT NULL
        ORDER BY COALESCE(resolvedAt, closedAt) DESC LIMIT 5)
      UNION ALL
      (SELECT 'visitor', CONCAT(visitorType, ' at the gate'), visitorName, createdAt
        FROM gate_entries WHERE ${at('locId')} ORDER BY createdAt DESC LIMIT 5)
      UNION ALL
      (SELECT 'payment', CONCAT('Payment ', rc.receiptNumber, ' received'),
        CONCAT('₹', FORMAT(rc.paidAmount, 0), ' · Flat ', COALESCE(i.billToUnitNumber, '-')), rc.createdAt
        FROM receipts rc JOIN invoices i ON i.id = rc.invoiceId AND ${at('i.propertyId')}
        WHERE rc.isDeleted = 0 ORDER BY rc.createdAt DESC LIMIT 5)
      UNION ALL
      (SELECT 'invoice', CONCAT('Invoice ', invoiceNumber, ' generated'),
        CONCAT('₹', FORMAT(discountedAmount, 0), ' · Flat ', COALESCE(billToUnitNumber, '-')), createdAt
        FROM invoices WHERE isDeleted = 0 AND ${at('propertyId')} ORDER BY createdAt DESC LIMIT 5)
      UNION ALL
      (SELECT 'resident', 'Resident onboarded', CONCAT(firstName, ' ', COALESCE(lastName, '')), createdAt
        FROM residents WHERE isDeleted = 0 AND ${at('locId')} ORDER BY createdAt DESC LIMIT 5)
      ORDER BY at DESC LIMIT 8`)

    res.status(200).json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        overview: {
          residents: {
            residing: num(residentCounts?.residing),
            total: num(residentCounts?.total),
            residingFamilyMembers: num(familyCounts?.residing),
            pending: num(residentCounts?.pending),
            movedOut: num(residentCounts?.movedOut),
            away: num(residentCounts?.away),
            movedInToday: num(residentCounts?.movedInToday),
            movedOutToday: num(residentCounts?.movedOutToday),
            acuity: {
              stable: num(residentCounts?.stable),
              moderate: num(residentCounts?.moderate),
              critical: num(residentCounts?.critical),
            },
          },
          criticalResidents: {
            total: criticalCount,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(criticalCount / limit)),
            items: criticalRows.map((r) => ({
              id: r.id,
              name: `${r.firstName} ${r.lastName || ''}`.trim(),
              unit: r.unit?.unit_number ?? null,
              photoUrl: r.photoUrl || null,
              gender: r.gender || null,
            })),
          },
          tickets: {
            total: ticketTotal,
            byStatus: tickets,
            openNow: tickets.open + tickets.inProgress + tickets.onHold,
            urgentOpen:
              num(ticketPriority.find((r) => r.priority === 'URGENT')?.n) +
              num(ticketPriority.find((r) => r.priority === 'CRITICAL')?.n),
            byPriority: ['CRITICAL', 'URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((p) => ({
              priority: p,
              count: num(ticketPriority.find((r) => r.priority === p)?.n),
            })),
            resolutionRate: pct(ticketDone, ticketCounted),
            trend: days.map((d) => ({
              day: d,
              created: createdByDay.get(d) ?? 0,
              resolved: resolvedByDay.get(d) ?? 0,
            })),
          },
          feedback: {
            total: fbTotal,
            good: fbGood,
            average: fbAverage,
            poor: fbPoor,
            /** Out of 5: good = 5, average = 3, poor = 1. */
            score: fbTotal ? round1((fbGood * 5 + fbAverage * 3 + fbPoor) / fbTotal) : 0,
          },
          visitors: {
            last30Days: ['Guest', 'Delivery', 'Cab', 'Office', 'Other'].map((t) => ({
              type: t,
              count: num(visitorTypes.find((r) => r.t === t)?.n),
            })),
            today: visitorsByDay.get(today) ?? 0,
            insideNow: num(visitorNow?.inside),
            awaitingApproval: num(visitorNow?.awaiting),
            trend: days.map((d) => ({ day: d, count: visitorsByDay.get(d) ?? 0 })),
          },
          staff: {
            total: staffByDepartment.reduce((a, d) => a + d.count, 0),
            byDepartment: staffByDepartment,
          },
          medical: {
            doctors,
            nurses: medicalOthers,
            appointmentsToday: {
              total: num(apptToday?.total),
              completed: num(apptToday?.completed),
              upcoming: num(apptToday?.upcoming),
              missed: num(apptToday?.missed),
            },
            trend: days.map((d) => ({ day: d, count: apptsByDay.get(d) ?? 0 })),
            careTasks: { active: num(care?.active), completedToday: num(care?.completedToday) },
          },
          events: {
            total: num(events?.total),
            upcoming: num(events?.upcoming),
            today: num(events?.today),
            thisMonth: num(events?.thisMonth),
            seatsBookedThisMonth: num(eventRegs?.seats),
            attendedThisMonth: num(eventRegs?.attended),
          },
          dining: {
            ordersToday: num(dining?.orders),
            dineIn: num(dining?.dineIn),
            roomService: num(dining?.roomService),
            completed: num(dining?.completed),
            dineInAttendanceToday: num(dineInAttendance?.n),
          },
          recentActivity: activity.map((a) => ({ type: a.type, title: a.title, detail: a.detail, at: a.at })),
        },
        occupancy: {
          totalUnits,
          occupied: occupiedUnits,
          ownerOccupied: num(units?.owner),
          tenantOccupied: num(units?.tenant),
          vacant: num(units?.vacant),
          booked: num(units?.booked),
          occupancyRate: pct(occupiedUnits, totalUnits),
          blocks: num(units?.blocks),
          floors: num(units?.floors),
          residingResidents: num(residentCounts?.residing),
          residingFamilyMembers: num(familyCounts?.residing),
          unitTypes: unitTypes.map((u) => ({ type: String(u.t), total: num(u.total), occupied: num(u.occupied) })),
          byBlock: blocks.map((b) => ({ name: b.name, total: num(b.total), occupied: num(b.occupied) })),
          movement: months.map((m) => ({
            month: m,
            moveIns: moveInByMonth.get(m) ?? 0,
            moveOuts: moveOutByMonth.get(m) ?? 0,
          })),
        },
        billing: {
          invoiceCount: num(inv?.n),
          totalBilled: billed,
          totalCollected: collected,
          outstanding: num(inv?.outstanding),
          overdue: num(inv?.overdue),
          collectionRate: Math.min(100, pct(collected, billed)),
          receipts: num(collectedRow?.n),
          statusCounts: {
            draft: num(inv?.draft),
            pending: num(inv?.pending),
            partiallyPaid: num(inv?.partiallyPaid),
            paid: num(inv?.paid),
            overdue: num(inv?.overdueCount),
            carriedForward: num(inv?.carried),
          },
          monthly: months.map((m) => ({
            month: m,
            billed: billedByMonth.get(m) ?? 0,
            collected: collectedByMonth.get(m) ?? 0,
          })),
          paymentMethods: paymentMethods.map((p) => ({ method: p.method, amount: num(p.amount), count: num(p.n) })),
          topOutstanding: topOutstanding.map((t) => ({
            unit: t.unit,
            name: t.name,
            due: num(t.due),
            invoices: num(t.invoices),
          })),
          subscriptions: {
            carePackages: num(subs?.care),
            carePackagesValue: num(subs?.careValue),
            foodPackages: num(subs?.food),
            foodPackagesValue: num(subs?.foodValue),
          },
        },
        inventory: {
          itemsTracked: num(invTotals?.items),
          categories: num(invTotals?.categories),
          suppliers: num(invTotals?.suppliers),
          totalUnits: num(invTotals?.units),
          inStock: inStock.length,
          outOfStock: outOfStock.length,
          lowStock: lowStock.length,
          purchaseOrders: {
            total: num(invTotals?.poTotal),
            byStatus: poStatus.map((p) => ({ status: p.status, count: num(p.n) })),
          },
          byCategory: [...categoryStock.values()].sort((a, b) => b.quantity - a.quantity),
          lowStockItems: lowStock.slice(0, 8).map((s) => ({
            name: s.name,
            category: s.category,
            quantity: num(s.quantity),
            threshold: num(s.threshold),
          })),
          monthly: months.map((m, i) => ({ month: m, issued: issued[i] ?? 0, received: received[i] ?? 0 })),
        },
      },
    })
  } catch (err: unknown) {
    console.error('Dashboard stats error:', err)
    const message = err instanceof Error ? err.message : 'Failed to fetch dashboard stats'
    res.status(500).json({ success: false, message })
  }
}
