import { Op, type Transaction } from 'sequelize'
import {
  BillingMode,
  InvoiceStatus,
  OPEN_INVOICE_STATUSES,
  ServiceType,
  USAGE_SERVICE_TYPES,
  VOID_INVOICE_STATUSES,
} from '../../enums/billing.enum.js'
import { Invoice, ServicesInvoice } from '../../models/index.js'
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
import { BillingError, describeConsumer, loadUnitContext, resolveBillTo, residentName } from './context.js'
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
  /** Pending (nothing paid): carried into the new invoice automatically. Others stay payable on their own. */
  carryForward: boolean
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
  }
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
    const items = await source.load(ctx)
    itemsBySource.set(source, items)
    for (const item of items) {
      const cost = activeCost(item, start, end)
      if (!cost || cost.amount <= 0) continue
      lines.push(
        recurringLine(source, item, cost.from, cost.to, cost.amount, mode === BillingMode.MONTHLY ? 'Advance' : ''),
      )
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
      })
    }
  }
  return lines
}

/**
 * Usage charges in the range, plus any recorded late for an already-invoiced period
 * (back to the flat's first invoice), minus anything already on an invoice.
 */
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
    const from = ctx.movedInDate ?? startOfMonth(to)
    return from <= to ? { from, to } : null
  }
  const firstInvoiced = invoices.reduce<string | null>(
    (min, inv) => (min === null || String(inv.startDate) < min ? String(inv.startDate) : min),
    null,
  )
  return { from: firstInvoiced && firstInvoiced < start ? firstInvoiced : start, to: end }
}

/** Usage charges in [from, to] that are on no invoice yet. */
async function usageLines(
  ctx: UnitBillingContext,
  invoices: Invoice[],
  from: string,
  to: string,
  transaction?: Transaction,
) {
  const billedRows = invoices.length
    ? await ServicesInvoice.findAll({
        where: {
          invoiceId: invoices.map((inv) => inv.id),
          isDeleted: false,
          serviceType: [...USAGE_SERVICE_TYPES],
          sourceId: { [Op.ne]: null },
        },
        attributes: ['serviceType', 'sourceId'],
        transaction: transaction ?? null,
      })
    : []
  const billed = new Set(billedRows.map((r) => `${r.serviceType}:${r.sourceId}`))

  const lines: ServiceLine[] = []
  for (const source of USAGE_SOURCES) {
    for (const line of await source.load(ctx, from, to)) {
      if (!billed.has(line.id)) lines.push(line)
    }
  }
  return lines
}

/**
 * Unpaid invoices for earlier periods. Pending ones (nothing paid yet) are carried into the new
 * invoice automatically; partly paid or overdue ones stay payable on their own invoice.
 */
export async function pendingInvoices(
  unitId: string,
  beforeDay: string,
  excludeInvoiceId?: string,
  transaction?: Transaction,
): Promise<PendingInvoiceSummary[]> {
  const open = await Invoice.findAll({
    where: {
      unitId,
      isDeleted: false,
      status: { [Op.in]: [...OPEN_INVOICE_STATUSES] },
      endDate: { [Op.lt]: beforeDay },
      ...(excludeInvoiceId ? { id: { [Op.ne]: excludeInvoiceId } } : {}),
    },
    order: [['startDate', 'ASC']],
    transaction: transaction ?? null,
  })
  return open
    .map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      startDate: String(inv.startDate),
      endDate: String(inv.endDate),
      total: Number(inv.discountedAmount),
      paidAmount: Number(inv.paidAmount),
      balance: Number(inv.remainingBalance),
      status: inv.status,
      carryForward: inv.status === InvoiceStatus.PENDING && Number(inv.paidAmount) === 0,
    }))
    .filter((inv) => inv.balance > 0)
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
      ? await adjustmentLines(invoices, start, itemsBySource, opts.transaction)
      : []
  const servicesPeriod = usageWindow(ctx, invoices, opts.billingMode, start, end)
  const usage = servicesPeriod
    ? await usageLines(ctx, invoices, servicesPeriod.from, servicesPeriod.to, opts.transaction)
    : []

  const services = [...recurring, ...adjustments, ...usage]
    .map((s) => ({ ...s, ...describeConsumer(ctx, s.residentId, s.familyMemberId) }))
    .sort(
      (a, b) =>
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
  }
}

/** Usage charges in [from, to] that are on no invoice yet. */
export async function getUnbilledUsage(unitId: string, from: string, to: string): Promise<ServiceLine[]> {
  const ctx = await loadUnitContext(unitId)
  const invoices = await unitInvoices(unitId, undefined)
  return usageLines(ctx, invoices, from, to)
}
