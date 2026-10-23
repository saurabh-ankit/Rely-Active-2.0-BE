import { Op, type Transaction } from 'sequelize'
import {
  BillingMode,
  InvoiceStatus,
  OPEN_INVOICE_STATUSES,
  ServiceType,
  USAGE_SERVICE_TYPES,
  VOID_INVOICE_STATUSES,
} from '../../enums/billing.enum.js'
import { Invoice, Resident, ServicesInvoice } from '../../models/index.js'
import { movedAwayInvoiceIds, previousFlatInvoices } from './movedInvoices.js'
import type { InvoiceBillTo } from '../../models/invoice.model.js'
import {
  addDays,
  daysInclusive,
  endOfMonth,
  isFullCalendarMonth,
  overlapRange,
  prorateMonthly,
  roundMoney,
  startOfMonth,
  todayDay,
} from '../../utils/billing/dates.js'
import {
  BILLABLE_RESIDENT_WHERE,
  BillingError,
  describeConsumer,
  fromUnitFor,
  labelOldFlats,
  loadUnitContext,
  resolveBillTo,
  residentName,
} from './context.js'
import { RECURRING_SOURCES } from './sources/recurring.sources.js'
import { getTaxConfig } from './tax.service.js'
import { USAGE_SOURCES } from './sources/usage.sources.js'
import type { RecurringItem, RecurringSource, ServiceLine, UnitBillingContext } from './types.js'

/** Display order of lines on the invoice. */
const TYPE_ORDER = Object.values(ServiceType)

/** Differences below this are rounding noise, not a package change. */
const ADJUSTMENT_THRESHOLD = 1

export interface PendingInvoiceSummary {
  id: string
  invoiceNumber: string
  startDate: string
  endDate: string
  total: number
  paidAmount: number
  balance: number
  status: string
  /**
   * Carried into the new invoice automatically: this flat's pending ones (nothing paid), and every
   * unpaid invoice of a flat the residents moved here from. Others stay payable on their own.
   */
  carryForward: boolean
  /** The old flat it was raised on, for an invoice the residents brought along when they moved here. */
  fromUnitId: string | null
  fromUnitNumber: string | null
}

export interface InvoicePreview {
  unitId: string
  unitNumber: string
  propertyId: string
  billingMode: BillingMode
  startDate: string
  endDate: string
  services: ServiceLine[]
  subtotal: number
  total: number
  currency: string
  billTo: InvoiceBillTo
  residents: { id: string; name: string; residentType: string; isResiding: boolean; phone: string | null }[]
  familyMembers: {
    id: string
    name: string
    relation: string
    phone: string | null
    isResiding: boolean
    residentId: string
  }[]
  movedInDate: string | null
  /** Days the rent / package lines cover, and the days the service lines were used on. */
  recurringPeriod: { from: string; to: string }
  /** Null for a first bill: no previous month to bill services for. */
  servicesPeriod: { from: string; to: string } | null
  /** GST applied on the total after discount. */
  tax: { gstEnabled: boolean; rate: number; cgstRate: number; sgstRate: number }
  nextBillableStartDate: string
  pendingInvoices: PendingInvoiceSummary[]
  /** An existing invoice already covering part of this range (creating would be refused). */
  overlappingInvoice: { id: string; invoiceNumber: string; startDate: string; endDate: string } | null
  /** Flats the residents lived in before this one; lines from them carry `fromUnitId`. */
  previousFlats: { unitId: string; unitNumber: string; lastDay: string }[]
}

export interface BuildOptions {
  unitId: string
  billingMode: BillingMode
  startDate?: string | undefined
  endDate?: string | undefined
  /** Invoice being edited: its own lines don't count as already billed. */
  excludeInvoiceId?: string | undefined
  transaction?: Transaction | undefined
}

const monthLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })

const describePeriod = (from: string, to: string) =>
  isFullCalendarMonth(from, to)
    ? monthLabel(from)
    : `${from} to ${to} (${daysInclusive(from, to)} of ${daysInclusive(startOfMonth(from), endOfMonth(from))} days)`

/** Prorated cost of a recurring item over the part of [from, to] it was active. */
const activeCost = (item: RecurringItem, from: string, to: string) => {
  const overlap = overlapRange(from, to, item.activeFrom, item.activeTo)
  return overlap ? { ...overlap, amount: prorateMonthly(item.monthlyPrice, overlap.from, overlap.to) } : null
}

const dmy = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`

/** A rent / package line shown as days × daily rate (Assist style); the total is the exact prorated amount. */
const recurringLine = (
  source: RecurringSource,
  item: RecurringItem,
  from: string,
  to: string,
  amount: number,
  tag: string,
  fromUnitId: string | null = null,
): ServiceLine => {
  const days = daysInclusive(from, to)
  // A whole calendar month is the package's monthly price, with no quantity (shown as N/A).
  const fullMonth = isFullCalendarMonth(from, to)
  return {
    id: `${source.serviceType}:${item.sourceId}:${from}`,
    serviceType: source.serviceType,
    type: source.serviceType,
    name: item.name,
    description: fullMonth
      ? `${monthLabel(from)} – full month (from ${dmy(from)} to ${dmy(to)})${tag ? ` [${tag}]` : ''}`
      : `${days} day(s) (from ${dmy(from)} to ${dmy(to)})${tag ? ` [${tag}]` : ''}`,
    quantity: fullMonth ? 0 : days,
    price: fullMonth ? amount : roundMoney(amount / days),
    total: amount,
    residentId: item.residentId,
    familyMemberId: item.familyMemberId ?? null,
    consumerType: null,
    consumerName: null,
    sourceId: item.sourceId,
    serviceStartDate: from,
    serviceEndDate: to,
    date: from,
    isAdjustment: false,
    fromUnitId,
    fromUnitNumber: null,
  }
}

/** Starts an item after the days already billed for it on another flat (resident moved here). */
const afterBilledElsewhere = (ctx: UnitBillingContext, source: RecurringSource, item: RecurringItem) => {
  const billedUntil = ctx.billedElsewhere.get(`${source.serviceType}:${item.sourceId}`)
  if (!billedUntil || (item.activeFrom && item.activeFrom > billedUntil)) return item
  const activeFrom = addDays(billedUntil, 1)
  return item.activeTo && item.activeTo < activeFrom ? null : { ...item, activeFrom }
}

/** [from, to] split on the days the resident moved, so days in the old flat are their own line. */
const splitOnMoves = (ctx: UnitBillingContext, residentId: string | null, from: string, to: string) => {
  const cuts = (residentId ? (ctx.moves.get(residentId) ?? []) : [])
    .map((m) => m.moveDate)
    .filter((d) => d > from && d <= to)
  const segments: { from: string; to: string }[] = []
  let segFrom = from
  for (const cut of cuts) {
    segments.push({ from: segFrom, to: addDays(cut, -1) })
    segFrom = cut
  }
  segments.push({ from: segFrom, to })
  return segments
}

async function unitInvoices(unitId: string, excludeInvoiceId: string | undefined, transaction?: Transaction) {
  return Invoice.findAll({
    where: {
      unitId,
      isDeleted: false,
      status: { [Op.notIn]: [...VOID_INVOICE_STATUSES] },
      ...(excludeInvoiceId ? { id: { [Op.ne]: excludeInvoiceId } } : {}),
    },
    order: [['endDate', 'DESC']],
    transaction: transaction ?? null,
  })
}

/**
 * First day not yet covered by an invoice. A flat never billed starts from its first
 * move-in day, so no month is skipped (or the current month if nobody has a move-in date).
 */
export const nextBillableStart = (invoices: Invoice[], ctx: UnitBillingContext): string =>
  invoices.length ? addDays(String(invoices[0]!.endDate), 1) : (ctx.movedInDate ?? startOfMonth(todayDay()))

function resolveRange(
  mode: BillingMode,
  nextBillable: string,
  movedInDate: string | null,
  startDate?: string,
  endDate?: string,
) {
  if (mode === BillingMode.MONTHLY) {
    let start = startDate || nextBillable
    if (movedInDate && start.slice(0, 7) < movedInDate.slice(0, 7)) {
      throw new BillingError(`Residents moved in on ${movedInDate}; pick that month or later`)
    }
    // Within a month, start at the first day not yet billed (the move-in date for the first bill).
    if (nextBillable.slice(0, 7) === start.slice(0, 7) && nextBillable > start) start = nextBillable
    if (movedInDate && movedInDate.slice(0, 7) === start.slice(0, 7) && movedInDate > start) start = movedInDate
    return { start, end: endOfMonth(start) }
  }
  if (!startDate || !endDate) throw new BillingError('Start and end dates are required for a custom invoice')
  if (endDate < startDate) throw new BillingError('End date must be on or after the start date')
  return { start: startDate, end: endDate }
}

/**
 * MONTHLY: every rent / package known when the bill is made is billed in advance for the
 * days of the bill's month it is active (e.g. a food package starting on the 17th is billed
 * 17th–30th). One added after the bill is picked up by the next bill as a previous-month line.
 * CUSTOM: each item is prorated over the days it was active in the range.
 */
async function recurringLines(ctx: UnitBillingContext, mode: BillingMode, start: string, end: string) {
  const lines: ServiceLine[] = []
  const itemsBySource = new Map<RecurringSource, RecurringItem[]>()
  for (const source of RECURRING_SOURCES) {
    const items = (await source.load(ctx))
      .map((item) => afterBilledElsewhere(ctx, source, item))
      .filter((item): item is RecurringItem => !!item)
    itemsBySource.set(source, items)
    for (const item of items) {
      const cost = activeCost(item, start, end)
      if (!cost || cost.amount <= 0) continue
      for (const seg of splitOnMoves(ctx, item.residentId, cost.from, cost.to)) {
        const amount = prorateMonthly(item.monthlyPrice, seg.from, seg.to)
        if (amount <= 0) continue
        const fromUnitId = fromUnitFor(ctx, item.residentId, seg.from)
        const tag = fromUnitId ? '' : mode === BillingMode.MONTHLY ? 'Advance' : ''
        lines.push(recurringLine(source, item, seg.from, seg.to, amount, tag, fromUnitId))
      }
    }
  }
  return { lines, itemsBySource }
}

/**
 * Package adjustment (Assist MONTHLY reconciliation): for the previous invoice's period,
 * compare what each care / food package actually cost (days active × daily rate) with
 * what was billed for that period, and add the difference as a charge or refund.
 */
async function adjustmentLines(
  ctx: UnitBillingContext,
  invoices: Invoice[],
  start: string,
  itemsBySource: Map<RecurringSource, RecurringItem[]>,
  transaction?: Transaction,
): Promise<ServiceLine[]> {
  const previous = invoices.find((inv) => String(inv.endDate) < start)
  if (!previous) return []
  const pFrom = String(previous.startDate)
  const pTo = String(previous.endDate)
  const adjustable = [...itemsBySource.keys()].filter((s) => s.adjustable)

  const billedRows = await ServicesInvoice.findAll({
    where: {
      invoiceId: invoices.map((inv) => inv.id),
      isDeleted: false,
      serviceType: adjustable.map((s) => s.serviceType),
      sourceId: { [Op.ne]: null },
      serviceStartDate: { [Op.gte]: pFrom },
      serviceEndDate: { [Op.lte]: pTo },
    },
    attributes: ['serviceType', 'sourceId', 'total', 'name', 'residentId'],
    transaction: transaction ?? null,
  })
  const billed = new Map<string, { total: number; name: string; residentId: string | null }>()
  for (const row of billedRows) {
    const key = `${row.serviceType}:${row.sourceId}`
    const prev = billed.get(key)
    billed.set(key, {
      total: (prev?.total ?? 0) + Number(row.total),
      name: prev?.name ?? row.name,
      residentId: prev?.residentId ?? row.residentId,
    })
  }

  const lines: ServiceLine[] = []
  for (const source of adjustable) {
    const items = itemsBySource.get(source) ?? []
    const keys = new Set([
      ...items.map((i) => `${source.serviceType}:${i.sourceId}`),
      ...[...billed.keys()].filter((k) => k.startsWith(`${source.serviceType}:`)),
    ])
    for (const key of keys) {
      const sourceId = key.slice(source.serviceType.length + 1)
      const item = items.find((i) => i.sourceId === sourceId)
      // A resident who moved to another flat: the days already billed here stay billed here.
      if (!item && ctx.movedAwayResidentIds.has(billed.get(key)?.residentId ?? '')) continue
      const actual = item ? (activeCost(item, pFrom, pTo)?.amount ?? 0) : 0
      const already = roundMoney(billed.get(key)?.total ?? 0)
      const diff = roundMoney(actual - already)
      if (Math.abs(diff) < ADJUSTMENT_THRESHOLD) continue
      const name = item?.name ?? billed.get(key)?.name ?? source.serviceType
      // Not billed at all last time (e.g. package added after that bill): bill its days there.
      const missed = already === 0 && item ? activeCost(item, pFrom, pTo) : null
      const days = missed ? daysInclusive(missed.from, missed.to) : 0
      lines.push({
        id: `${key}:adj:${pFrom}`,
        serviceType: source.serviceType,
        type: source.serviceType,
        name: missed ? name : `${name} – adjustment (${diff > 0 ? 'additional charge' : 'refund'})`,
        description: missed
          ? `${days} day(s) (from ${dmy(missed.from)} to ${dmy(missed.to)}) [Previous month]`
          : `${describePeriod(pFrom, pTo)}: used ₹${actual.toFixed(2)}, billed ₹${already.toFixed(2)}`,
        quantity: missed ? days : 1,
        price: missed ? roundMoney(diff / days) : diff,
        total: diff,
        residentId: item?.residentId ?? billed.get(key)?.residentId ?? null,
        familyMemberId: item?.familyMemberId ?? null,
        consumerType: null,
        consumerName: null,
        sourceId,
        serviceStartDate: pFrom,
        serviceEndDate: pTo,
        date: pFrom,
        isAdjustment: true,
        fromUnitId: null,
        fromUnitNumber: null,
      })
    }
  }
  return lines
}

/**
 * Window of usage charges an invoice picks up.
 * MONTHLY (Assist): the services of the months before the bill's month — everything unbilled
 * since move-in up to the end of the previous month. The first bill (move-in month) has no
 * previous month, so it carries only the advance; its month's services go on the next bill.
 * CUSTOM: the range itself, plus anything recorded late for an already-invoiced period.
 * Null when there is nothing to pick up.
 */
function usageWindow(ctx: UnitBillingContext, invoices: Invoice[], mode: BillingMode, start: string, end: string) {
  if (mode === BillingMode.MONTHLY) {
    const to = addDays(startOfMonth(start), -1)
    // From the first move-in: a resident who moved here brings their old flat's unbilled services.
    const from = ctx.usageFromDate ?? startOfMonth(to)
    return from <= to ? { from, to } : null
  }
  const firstInvoiced = invoices.reduce<string | null>(
    (min, inv) => (min === null || String(inv.startDate) < min ? String(inv.startDate) : min),
    null,
  )
  return { from: firstInvoiced && firstInvoiced < start ? firstInvoiced : start, to: end }
}

/**
 * Usage charges in [from, to] that are on no invoice yet — on any flat's invoice, since a
 * resident who moved brings their charges along. Charges from the resident's time in another
 * flat are marked with that flat.
 */
async function usageLines(
  ctx: UnitBillingContext,
  from: string,
  to: string,
  excludeInvoiceId?: string,
  transaction?: Transaction,
) {
  const candidates: ServiceLine[] = []
  for (const source of USAGE_SOURCES) candidates.push(...(await source.load(ctx, from, to)))
  if (!candidates.length) return []

  const billedRows = await ServicesInvoice.findAll({
    where: {
      isDeleted: false,
      serviceType: [...USAGE_SERVICE_TYPES],
      sourceId: [...new Set(candidates.map((l) => l.sourceId))],
      ...(excludeInvoiceId ? { invoiceId: { [Op.ne]: excludeInvoiceId } } : {}),
    },
    attributes: ['serviceType', 'sourceId'],
    include: [
      {
        model: Invoice,
        as: 'invoice',
        attributes: [],
        where: { isDeleted: false, status: { [Op.notIn]: [...VOID_INVOICE_STATUSES] } },
      },
    ],
    transaction: transaction ?? null,
  })
  const billed = new Set(billedRows.map((r) => `${r.serviceType}:${r.sourceId}`))

  return candidates
    .filter((line) => !billed.has(line.id))
    .map((line) => {
      const own = line.fromUnitId && line.fromUnitId !== ctx.unitId ? line.fromUnitId : null
      return { ...line, fromUnitId: own ?? fromUnitFor(ctx, line.residentId, line.serviceStartDate) }
    })
}

/**
 * Unpaid invoices for earlier periods, oldest first:
 * - this flat's own: pending ones (nothing paid) are carried into the new invoice; partly paid or
 *   overdue ones stay payable on their own. Invoices that went with a resident who moved out of
 *   this flat are left out — they are owed on that resident's new flat.
 * - every unpaid invoice of a flat the residents moved here from: always carried, for its
 *   remaining balance (partly paid ones too).
 */
export async function openInvoicesToCollect(
  unitId: string,
  beforeDay: string,
  excludeInvoiceId?: string,
  transaction?: Transaction,
  lock = false,
): Promise<{ invoice: Invoice; carryForward: boolean; fromOldFlat: boolean }[]> {
  const lockOpt = lock && transaction ? { lock: transaction.LOCK.UPDATE } : {}
  const [own, movedAway, residents] = await Promise.all([
    Invoice.findAll({
      where: {
        unitId,
        isDeleted: false,
        status: { [Op.in]: [...OPEN_INVOICE_STATUSES] },
        endDate: { [Op.lt]: beforeDay },
        ...(excludeInvoiceId ? { id: { [Op.ne]: excludeInvoiceId } } : {}),
      },
      order: [['startDate', 'ASC']],
      transaction: transaction ?? null,
      ...lockOpt,
    }),
    movedAwayInvoiceIds(unitId, transaction),
    Resident.findAll({
      where: { unitId, ...BILLABLE_RESIDENT_WHERE },
      attributes: ['id'],
      transaction: transaction ?? null,
    }),
  ])
  const previous = await previousFlatInvoices(
    residents.map((r) => r.id),
    unitId,
    { openOnly: true, transaction, lock },
  )
  return [
    ...own
      .filter((inv) => !movedAway.has(inv.id) && Number(inv.remainingBalance) > 0)
      .map((invoice) => ({
        invoice,
        carryForward: invoice.status === InvoiceStatus.PENDING && Number(invoice.paidAmount) === 0,
        fromOldFlat: false,
      })),
    ...previous.map((invoice) => ({ invoice, carryForward: true, fromOldFlat: true })),
  ].sort((a, b) => String(a.invoice.startDate).localeCompare(String(b.invoice.startDate)))
}

export async function pendingInvoices(
  unitId: string,
  beforeDay: string,
  excludeInvoiceId?: string,
  transaction?: Transaction,
): Promise<PendingInvoiceSummary[]> {
  return (await openInvoicesToCollect(unitId, beforeDay, excludeInvoiceId, transaction)).map(
    ({ invoice: inv, carryForward, fromOldFlat }) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      startDate: String(inv.startDate),
      endDate: String(inv.endDate),
      total: Number(inv.discountedAmount),
      paidAmount: Number(inv.paidAmount),
      balance: Number(inv.remainingBalance),
      status: inv.status,
      carryForward,
      fromUnitId: fromOldFlat ? inv.unitId : null,
      fromUnitNumber: fromOldFlat
        ? ((inv as Invoice & { unit?: { unit_number: string } }).unit?.unit_number ?? null)
        : null,
    }),
  )
}

export async function buildInvoicePreview(opts: BuildOptions): Promise<InvoicePreview> {
  const ctx = await loadUnitContext(opts.unitId)
  const invoices = await unitInvoices(opts.unitId, opts.excludeInvoiceId, opts.transaction)
  const nextBillableStartDate = nextBillableStart(invoices, ctx)
  const { start, end } = resolveRange(
    opts.billingMode,
    nextBillableStartDate,
    ctx.movedInDate,
    opts.startDate,
    opts.endDate,
  )

  const { lines: recurring, itemsBySource } = await recurringLines(ctx, opts.billingMode, start, end)
  const adjustments =
    opts.billingMode === BillingMode.MONTHLY
      ? await adjustmentLines(ctx, invoices, start, itemsBySource, opts.transaction)
      : []
  const servicesPeriod = usageWindow(ctx, invoices, opts.billingMode, start, end)
  const usage = servicesPeriod
    ? await usageLines(ctx, servicesPeriod.from, servicesPeriod.to, opts.excludeInvoiceId, opts.transaction)
    : []

  const services = (await labelOldFlats(ctx, [...recurring, ...adjustments, ...usage]))
    .map((s) => ({ ...s, ...describeConsumer(ctx, s.residentId, s.familyMemberId) }))
    .sort(
      (a, b) =>
        // Charges carried over from an old flat first, grouped by that flat.
        Number(!a.fromUnitId) - Number(!b.fromUnitId) ||
        (a.fromUnitNumber ?? '').localeCompare(b.fromUnitNumber ?? '') ||
        TYPE_ORDER.indexOf(a.serviceType) - TYPE_ORDER.indexOf(b.serviceType) ||
        Number(a.isAdjustment) - Number(b.isAdjustment) ||
        a.date.localeCompare(b.date) ||
        // Resident's line before family members' for the same service.
        Number(a.consumerType === 'FAMILY_MEMBER') - Number(b.consumerType === 'FAMILY_MEMBER'),
    )
  const subtotal = roundMoney(services.reduce((sum, s) => sum + s.total, 0))
  const overlapping = invoices.find((inv) => String(inv.startDate) <= end && String(inv.endDate) >= start)

  return {
    unitId: ctx.unitId,
    unitNumber: ctx.unitNumber,
    propertyId: ctx.propertyId,
    billingMode: opts.billingMode,
    startDate: start,
    endDate: end,
    services,
    subtotal,
    total: subtotal,
    currency: 'INR',
    billTo: resolveBillTo(ctx),
    residents: ctx.residents.map((r) => ({
      id: r.id,
      name: residentName(r),
      residentType: r.residentType,
      isResiding: r.isResiding,
      phone: r.phone,
    })),
    familyMembers: ctx.familyMembers.map((f) => ({
      id: f.id,
      name: `${f.firstName || ''} ${f.lastName || ''}`.trim() || 'Family member',
      relation: f.relation,
      phone: f.phone,
      isResiding: f.isResiding,
      residentId: f.residentId,
    })),
    movedInDate: ctx.movedInDate,
    recurringPeriod: { from: start, to: end },
    servicesPeriod,
    tax: await getTaxConfig().then((t) => ({
      gstEnabled: t.gstEnabled,
      rate: t.rate,
      cgstRate: t.cgstRate,
      sgstRate: t.sgstRate,
    })),
    nextBillableStartDate,
    pendingInvoices: await pendingInvoices(opts.unitId, start, opts.excludeInvoiceId, opts.transaction),
    overlappingInvoice: overlapping
      ? {
          id: overlapping.id,
          invoiceNumber: overlapping.invoiceNumber,
          startDate: String(overlapping.startDate),
          endDate: String(overlapping.endDate),
        }
      : null,
    previousFlats: previousFlats(ctx),
  }
}

/** Each earlier flat of the residents, with the last day they lived there. */
const previousFlats = (ctx: UnitBillingContext) => {
  const byUnit = new Map<string, string>()
  for (const moves of ctx.moves.values()) {
    for (const m of moves) {
      if (m.fromUnitId === ctx.unitId) continue
      const lastDay = addDays(m.moveDate, -1)
      if (lastDay > (byUnit.get(m.fromUnitId) ?? '')) byUnit.set(m.fromUnitId, lastDay)
    }
  }
  return [...byUnit].map(([unitId, lastDay]) => ({
    unitId,
    unitNumber: ctx.unitNumbers.get(unitId) ?? '',
    lastDay,
  }))
}

/** Usage charges in [from, to] that are on no invoice yet. */
export async function getUnbilledUsage(unitId: string, from: string, to: string): Promise<ServiceLine[]> {
  const ctx = await loadUnitContext(unitId)
  return labelOldFlats(ctx, await usageLines(ctx, from, to))
}

/**
 * Everything not yet billed for one resident (and their family members) on a flat up to a day:
 * rent / package days after the flat's last invoice, and unbilled services. Used to show what a
 * resident moving to another flat takes along.
 */
export async function getUnbilledForResident(unitId: string, residentId: string, upTo: string) {
  const ctx = await loadUnitContext(unitId)
  const invoices = await unitInvoices(unitId, undefined)
  const next = nextBillableStart(invoices, ctx)
  const recurring = next <= upTo ? (await recurringLines(ctx, BillingMode.CUSTOM, next, upTo)).lines : []
  const usage = ctx.usageFromDate && ctx.usageFromDate <= upTo ? await usageLines(ctx, ctx.usageFromDate, upTo) : []
  const lines = (await labelOldFlats(ctx, [...recurring, ...usage]))
    .filter((l) => l.residentId === residentId)
    .map((s) => ({ ...s, ...describeConsumer(ctx, s.residentId, s.familyMemberId) }))
    .sort(
      (a, b) => TYPE_ORDER.indexOf(a.serviceType) - TYPE_ORDER.indexOf(b.serviceType) || a.date.localeCompare(b.date),
    )
  return { lines, total: roundMoney(lines.reduce((sum, l) => sum + l.total, 0)) }
}
