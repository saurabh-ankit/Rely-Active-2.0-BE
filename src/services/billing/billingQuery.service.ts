import { Op } from 'sequelize'
import {
  InvoiceDocumentType,
  InvoiceStatus,
  OPEN_INVOICE_STATUSES,
  CARRIED_INVOICE_STATUSES,
  VOID_INVOICE_STATUSES,
} from '../../enums/billing.enum.js'
import {
  CarriedForwardInvoice,
  Invoice,
  ReceiptAllocation,
  InvoiceDocument,
  MiscellaneousBilling,
  PropertyBlock,
  PropertyFloor,
  PropertyUnit,
  Receipt,
  Resident,
  ServicesInvoice,
  UnitMiscellaneousItem,
  User,
  UserDetail,
} from '../../models/index.js'
import { endOfMonth, localDay, roundMoney, toDay, todayDay } from '../../utils/billing/dates.js'
import { BILLABLE_RESIDENT_WHERE, BillingError, residentName, residentStartDays } from './context.js'
import { inWindow, loadMoves, moveWindows, previousFlatInvoices } from './movedInvoices.js'
import { ResidentStatus } from '../../enums/resident.enum.js'

export interface Page {
  page: number
  limit: number
}

const pagination = (total: number, { page, limit }: Page) => ({
  total,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil(total / limit)),
})

/** An unpaid invoice past its due date is reported as OVERDUE. */
const effectiveStatus = (inv: Invoice): InvoiceStatus =>
  (inv.status === InvoiceStatus.PENDING || inv.status === InvoiceStatus.PARTIALLY_PAID) &&
  inv.dueDate &&
  String(inv.dueDate) < todayDay()
    ? InvoiceStatus.OVERDUE
    : inv.status

export type AllocationWithInvoice = ReceiptAllocation & {
  invoice?: Invoice & { carriedForwardTo?: CarriedForwardInvoice | null }
}

/** Allocation rows with the invoice each went to (and where that invoice was carried). */
export const allocationInclude = {
  model: ReceiptAllocation,
  as: 'allocations',
  required: false,
  include: [
    {
      model: Invoice,
      as: 'invoice',
      attributes: ['id', 'invoiceNumber', 'startDate', 'endDate', 'status'],
      include: [
        { model: CarriedForwardInvoice, as: 'carriedForwardTo', attributes: ['targetInvoiceId'], required: false },
      ],
    },
  ],
}

/**
 * Where a receipt's money ended up. Each row's amount includes what it passed on to the invoices it
 * carries, so an invoice's own share is its row less the rows of invoices carried into it.
 */
export function receiptAppliedTo(receiptInvoiceId: string, allocations: AllocationWithInvoice[] = []) {
  if (!allocations.length) return []
  const passedOn = new Map<string, number>()
  for (const a of allocations) {
    const parent = a.invoice?.carriedForwardTo?.targetInvoiceId
    if (parent && a.invoiceId !== receiptInvoiceId) passedOn.set(parent, (passedOn.get(parent) ?? 0) + Number(a.amount))
  }
  return allocations
    .map((a) => ({
      invoiceId: a.invoiceId,
      invoiceNumber: a.invoice?.invoiceNumber ?? null,
      startDate: a.invoice?.startDate ?? null,
      endDate: a.invoice?.endDate ?? null,
      status: a.invoice?.status ?? null,
      /** Paid towards an older invoice carried into the receipt's invoice. */
      carried: a.invoiceId !== receiptInvoiceId,
      amount: roundMoney(Number(a.amount) - (passedOn.get(a.invoiceId) ?? 0)),
    }))
    .filter((a) => a.amount > 0)
    .sort((x, y) => String(x.startDate ?? '').localeCompare(String(y.startDate ?? '')))
}

const sumAmounts = (rows: { amount: number }[] = []) => roundMoney(rows.reduce((s, r) => s + Number(r.amount), 0))

type InvoiceWithParts = Invoice & {
  services?: ServicesInvoice[]
  miscellaneousItems?: MiscellaneousBilling[]
  receipts?: Receipt[]
  documents?: InvoiceDocument[]
  unit?: PropertyUnit
  carriedForwardTo?: (CarriedForwardInvoice & { targetInvoice?: Invoice }) | null
  carriedForwardFrom?: (CarriedForwardInvoice & { sourceInvoice?: Invoice & { allocations?: ReceiptAllocation[] } })[]
  allocations?: ReceiptAllocation[]
}

export const serializeInvoice = (inv: InvoiceWithParts) => {
  const docs = (inv.documents ?? []).filter((d) => !d.isDeleted)
  const receiptPdf = new Map(
    docs.filter((d) => d.documentType === InvoiceDocumentType.RECEIPT).map((d) => [d.receiptId, d.s3Url]),
  )
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    unitId: inv.unitId,
    unitNumber: inv.unit?.unit_number ?? inv.billToUnitNumber ?? null,
    propertyId: inv.propertyId,
    startDate: inv.startDate,
    endDate: inv.endDate,
    subtotal: inv.subtotal,
    tax: inv.tax,
    discount: inv.discount,
    discountPercentage: inv.discountPercentage === null ? null : Number(inv.discountPercentage),
    discountAmount: inv.discountAmount,
    discountReason: inv.discountReason,
    gst:
      inv.gstRate === null
        ? null
        : {
            gstNumber: inv.gstNumber,
            rate: inv.gstRate,
            cgstRate: inv.cgstRate,
            sgstRate: inv.sgstRate,
            taxable: inv.taxableAmount,
            cgst: inv.cgstAmount,
            sgst: inv.sgstAmount,
          },
    carriedForwardAmount: inv.carriedForwardAmount,
    total: inv.total,
    discountedAmount: inv.discountedAmount,
    remainingBalance: inv.remainingBalance,
    currency: inv.currency,
    status: effectiveStatus(inv),
    billingMode: inv.billingMode,
    dueDate: inv.dueDate,
    paidAmount: inv.paidAmount,
    paymentMethod: inv.paymentMethod,
    paymentReference: inv.paymentReference,
    notes: inv.notes,
    billTo: {
      residentId: inv.billToResidentId,
      name: inv.billToName,
      phone: inv.billToPhone,
      email: inv.billToEmail,
      unitNumber: inv.billToUnitNumber,
    },
    /** Set when this invoice's balance was carried into a newer invoice. */
    carriedForwardTo: inv.carriedForwardTo?.targetInvoice
      ? {
          invoiceId: inv.carriedForwardTo.targetInvoice.id,
          invoiceNumber: inv.carriedForwardTo.targetInvoice.invoiceNumber,
          amount: inv.carriedForwardTo.carriedAmount,
          /** Paid so far through the newer invoice. */
          paidAmount: roundMoney(sumAmounts(inv.allocations) - Number(inv.paidAmount)),
        }
      : null,
    /** Older invoices carried into this one, and how much of each is paid so far (oldest first). */
    carriedIn: (inv.carriedForwardFrom ?? [])
      .map((c) => ({
        invoiceId: c.sourceInvoiceId,
        invoiceNumber: c.sourceInvoice?.invoiceNumber ?? null,
        startDate: c.sourceInvoice?.startDate ?? null,
        endDate: c.sourceInvoice?.endDate ?? null,
        status: c.sourceInvoice?.status ?? null,
        carriedAmount: c.carriedAmount,
        // Paid through this invoice: leave out what was paid on it before it was carried.
        paidAmount: roundMoney(sumAmounts(c.sourceInvoice?.allocations) - Number(c.originalPaid || 0)),
      }))
      .sort((a, b) => String(a.startDate ?? '').localeCompare(String(b.startDate ?? ''))),
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
    pdfUrl: docs.find((d) => d.documentType === InvoiceDocumentType.INVOICE)?.s3Url ?? null,
    services: (inv.services ?? [])
      .filter((s) => !s.isDeleted)
      .map((s) => ({
        id: s.id,
        serviceType: s.serviceType,
        name: s.name,
        description: s.description,
        quantity: s.quantity,
        price: s.price,
        total: s.total,
        residentId: s.residentId,
        consumerType: s.consumerType,
        consumerName: s.consumerName,
        sourceId: s.sourceId,
        serviceStartDate: s.serviceStartDate,
        serviceEndDate: s.serviceEndDate,
        isAdjustment: s.isAdjustment,
        fromUnitId: s.fromUnitId,
        fromUnitNumber: s.fromUnit?.unit_number ?? null,
      })),
    miscellaneousItems: (inv.miscellaneousItems ?? [])
      .filter((m) => !m.isDeleted)
      .map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        quantity: m.quantity,
        price: m.price,
        total: m.total,
      })),
    receipts: (inv.receipts ?? [])
      .filter((r) => !r.isDeleted)
      .map((r) => ({
        id: r.id,
        receiptNumber: r.receiptNumber,
        paidAmount: r.paidAmount,
        paymentMethod: r.paymentMethod,
        paymentReference: r.paymentReference,
        createdAt: r.createdAt,
        invoiceStatus: r.invoiceStatus,
        invoiceTotal: r.invoiceTotal,
        paidBefore: r.paidBefore,
        invoiceRemainingBalance: r.invoiceRemainingBalance,
        appliedTo: receiptAppliedTo(inv.id, (r as Receipt & { allocations?: AllocationWithInvoice[] }).allocations),
        pdfUrl: receiptPdf.get(r.id) ?? null,
      })),
  }
}

const invoiceIncludes = [
  {
    model: ServicesInvoice,
    as: 'services',
    required: false,
    include: [{ model: PropertyUnit, as: 'fromUnit', attributes: ['id', 'unit_number'], required: false }],
  },
  { model: MiscellaneousBilling, as: 'miscellaneousItems', required: false },
  { model: Receipt, as: 'receipts', required: false, include: [allocationInclude] },
  { model: InvoiceDocument, as: 'documents', required: false },
  { model: ReceiptAllocation, as: 'allocations', attributes: ['id', 'amount'], required: false },
  {
    model: CarriedForwardInvoice,
    as: 'carriedForwardFrom',
    required: false,
    include: [
      {
        model: Invoice,
        as: 'sourceInvoice',
        attributes: ['id', 'invoiceNumber', 'startDate', 'endDate', 'status'],
        include: [{ model: ReceiptAllocation, as: 'allocations', attributes: ['id', 'amount'], required: false }],
      },
    ],
  },
  { model: PropertyUnit, as: 'unit', attributes: ['id', 'unit_number'] },
  {
    model: CarriedForwardInvoice,
    as: 'carriedForwardTo',
    required: false,
    include: [{ model: Invoice, as: 'targetInvoice', attributes: ['id', 'invoiceNumber'] }],
  },
]

export async function getInvoiceById(invoiceId: string) {
  const inv = await Invoice.findOne({ where: { id: invoiceId, isDeleted: false }, include: invoiceIncludes })
  if (!inv) throw new BillingError('Invoice not found', 404)
  return serializeInvoice(inv as InvoiceWithParts)
}

/**
 * A flat's invoices, newest first. `previousFlats` also returns the invoices of flats its
 * residents moved here from (they owe them here): 'open' those still unpaid (billing page), 'all'
 * their whole bill history there (resident app).
 */
export async function getUnitInvoices(
  unitId: string,
  page: Page,
  opts: { excludeDrafts?: boolean; previousFlats?: 'open' | 'all' } = {},
) {
  const where = {
    unitId,
    isDeleted: false,
    ...(opts.excludeDrafts ? { status: { [Op.ne]: InvoiceStatus.DRAFT } } : {}),
  }
  const total = await Invoice.count({ where })
  const rows = await Invoice.findAll({
    where,
    include: invoiceIncludes,
    order: [
      ['startDate', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    limit: page.limit,
    offset: (page.page - 1) * page.limit,
  })
  let fromPreviousFlats: ReturnType<typeof serializeInvoice>[] = []
  if (opts.previousFlats) {
    const residents = await Resident.findAll({ where: { unitId, ...BILLABLE_RESIDENT_WHERE }, attributes: ['id'] })
    const previous = await previousFlatInvoices(
      residents.map((r) => r.id),
      unitId,
      { openOnly: opts.previousFlats === 'open' },
    )
    if (previous.length) {
      const full = await Invoice.findAll({
        where: { id: previous.map((p) => p.id) },
        include: invoiceIncludes,
        order: [['startDate', 'DESC']],
      })
      fromPreviousFlats = full.map((r) => serializeInvoice(r as InvoiceWithParts))
    }
  }
  return {
    invoices: rows.map((r) => serializeInvoice(r as InvoiceWithParts)),
    /** Invoices of flats the residents moved here from (each carries its own unitNumber). */
    fromPreviousFlats,
    pagination: pagination(total, page),
  }
}

/**
 * Receipts for a flat, flattened with their invoice's details (Assist's receipts list shape).
 * Includes payments made on the flats its residents moved here from, for the invoices that came
 * with them (the same ones the Invoices tab lists); each row carries its flat's unitNumber.
 */
export async function getUnitReceipts(unitId: string, page: Page) {
  const residents = await Resident.findAll({ where: { unitId, ...BILLABLE_RESIDENT_WHERE }, attributes: ['id'] })
  const previousIds = (
    await previousFlatInvoices(
      residents.map((r) => r.id),
      unitId,
    )
  ).map((inv) => inv.id)
  const where = previousIds.length
    ? { isDeleted: false, [Op.or]: [{ unitId }, { invoiceId: previousIds }] }
    : { unitId, isDeleted: false }
  const total = await Receipt.count({ where })
  const receipts = await Receipt.findAll({
    where,
    include: [
      {
        model: Invoice,
        as: 'invoice',
        include: [{ model: PropertyUnit, as: 'unit', attributes: ['id', 'unit_number'] }],
      },
      allocationInclude,
      {
        model: User,
        as: 'handedOverToUser',
        attributes: ['id'],
        include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
      },
    ],
    order: [['createdAt', 'DESC']],
    limit: page.limit,
    offset: (page.page - 1) * page.limit,
  })
  const docs = receipts.length
    ? await InvoiceDocument.findAll({
        where: {
          receiptId: receipts.map((r) => r.id),
          documentType: InvoiceDocumentType.RECEIPT,
          isDeleted: false,
        },
      })
    : []
  const pdfByReceipt = new Map(docs.map((d) => [d.receiptId, d.s3Url]))

  return {
    receipts: receipts.map((r) => {
      const inv = (r as Receipt & { invoice?: Invoice }).invoice
      const handed = (r as Receipt & { handedOverToUser?: User & { profile?: UserDetail | null } }).handedOverToUser
      return {
        id: r.id,
        receiptId: r.id,
        receiptNumber: r.receiptNumber,
        pdfUrl: pdfByReceipt.get(r.id) ?? null,
        paidAmount: r.paidAmount,
        paymentMethod: r.paymentMethod,
        paymentReference: r.paymentReference,
        notes: r.notes,
        receiptCreatedAt: r.createdAt,
        receiptUpdatedAt: r.updatedAt,
        imageUrl: r.imageUrl,
        handedOverTo: handed
          ? { id: handed.id, firstName: handed.profile?.firstName ?? '', lastName: handed.profile?.lastName ?? '' }
          : null,
        invoiceStatus: r.invoiceStatus,
        invoiceTotal: r.invoiceTotal,
        paidBefore: r.paidBefore,
        invoiceRemainingBalance: r.invoiceRemainingBalance,
        appliedTo: receiptAppliedTo(
          r.invoiceId,
          (r as Receipt & { allocations?: AllocationWithInvoice[] }).allocations,
        ),
        invoiceId: inv?.id ?? r.invoiceId,
        invoiceNumber: inv?.invoiceNumber ?? null,
        /** The flat the invoice was raised on; differs from this flat for a previous flat's receipt. */
        unitNumber: (inv as InvoiceWithParts | undefined)?.unit?.unit_number ?? null,
        fromPreviousFlat: !!inv && inv.unitId !== unitId,
        startDate: inv?.startDate ?? null,
        endDate: inv?.endDate ?? null,
        status: inv ? effectiveStatus(inv) : null,
        total: inv?.total ?? null,
        discountedAmount: inv?.discountedAmount ?? null,
        invoicePaidAmount: inv?.paidAmount ?? null,
        createdAt: r.createdAt,
      }
    }),
    pagination: pagination(total, page),
  }
}

/** Where a flat stands for one month. */
export type MonthBillingStatus =
  'NOT_MOVED_IN' | 'MOVED_OUT' | 'NOT_BILLED' | 'PENDING' | 'PARTIALLY_PAID' | 'OVERDUE' | 'PAID' | 'CARRIED_FORWARD'

export const MONTH_STATUSES: MonthBillingStatus[] = [
  'NOT_MOVED_IN',
  'MOVED_OUT',
  'NOT_BILLED',
  'PENDING',
  'PARTIALLY_PAID',
  'OVERDUE',
  'PAID',
  'CARRIED_FORWARD',
]

/** Combined status of the invoices touching a month (worst state wins). */
function invoicesStatus(invoices: Invoice[]): MonthBillingStatus {
  const statuses = invoices.map(effectiveStatus)
  if (statuses.includes(InvoiceStatus.OVERDUE)) return 'OVERDUE'
  if (statuses.includes(InvoiceStatus.PARTIALLY_PAID)) return 'PARTIALLY_PAID'
  if (statuses.some((s) => s === InvoiceStatus.PENDING || s === InvoiceStatus.DRAFT)) {
    return statuses.includes(InvoiceStatus.PAID) ? 'PARTIALLY_PAID' : 'PENDING'
  }
  if (statuses.every((s) => (CARRIED_INVOICE_STATUSES as readonly InvoiceStatus[]).includes(s)))
    return 'CARRIED_FORWARD'
  return 'PAID'
}

/**
 * Billing directory of a property for one month: every flat with residents, whether
 * anyone lived there that month, and the status of the invoice(s) covering it.
 */
export async function getBillingUnits(
  propertyId: string,
  search: string,
  month: string,
  status: MonthBillingStatus | undefined,
  page: Page,
) {
  const monthStart = `${month}-01`
  const monthEnd = endOfMonth(monthStart)
  const like = search ? `%${search}%` : null

  const matching = await PropertyUnit.findAll({
    where: {
      isDeleted: false,
      ...(like
        ? {
            [Op.or]: [
              { unit_number: { [Op.like]: like } },
              { '$residents.firstName$': { [Op.like]: like } },
              { '$residents.lastName$': { [Op.like]: like } },
            ],
          }
        : {}),
    },
    include: [
      {
        model: PropertyFloor,
        as: 'floor',
        attributes: [],
        required: true,
        include: [{ model: PropertyBlock, as: 'block', attributes: [], where: { propertyId }, required: true }],
      },
      { model: Resident, as: 'residents', attributes: [], where: BILLABLE_RESIDENT_WHERE, required: true },
    ],
    attributes: ['id'],
    subQuery: false,
  })
  const unitIds = [...new Set(matching.map((u) => u.id))]
  const emptySummary = Object.fromEntries(MONTH_STATUSES.map((s) => [s, 0])) as Record<MonthBillingStatus, number>
  if (!unitIds.length) {
    return {
      month,
      earliestMonth: month,
      units: [],
      summary: { counts: emptySummary, billed: 0, collected: 0, outstanding: 0 },
      pagination: pagination(0, page),
    }
  }

  const units = await PropertyUnit.findAll({
    where: { id: unitIds },
    include: [
      {
        model: PropertyFloor,
        as: 'floor',
        attributes: ['id', 'floor_number'],
        include: [{ model: PropertyBlock, as: 'block', attributes: ['id', 'block_name'] }],
      },
      {
        model: Resident,
        as: 'residents',
        where: BILLABLE_RESIDENT_WHERE,
        required: false,
        attributes: [
          'status',
          'id',
          'firstName',
          'lastName',
          'residentType',
          'isResiding',
          'phone',
          'moveInDate',
          'moveOutDate',
          'unitId',
          'createdAt',
          'updatedAt',
        ],
      },
    ],
    order: [['unit_number', 'ASC']],
  })
  const allResidents = units.flatMap((unit) => (unit as PropertyUnit & { residents?: Resident[] }).residents ?? [])
  const startDays = await residentStartDays(allResidents)
  // A household that moved owes its old flat's unpaid invoices on its new flat.
  const windows = moveWindows(await loadMoves({ unitIds, residentIds: allResidents.map((r) => r.id) }))
  const oldFlatIds = [...new Set(windows.map((w) => w.fromUnitId))].filter((id) => !unitIds.includes(id))
  const oldFlatOpen = oldFlatIds.length
    ? await Invoice.findAll({
        where: { unitId: oldFlatIds, isDeleted: false, status: { [Op.in]: [...OPEN_INVOICE_STATUSES] } },
        attributes: ['id', 'unitId', 'startDate', 'status', 'remainingBalance'],
      })
    : []
  const invoices = await Invoice.findAll({
    where: { unitId: unitIds, isDeleted: false, status: { [Op.notIn]: [...VOID_INVOICE_STATUSES] } },
    attributes: [
      'id',
      'unitId',
      'invoiceNumber',
      'startDate',
      'endDate',
      'discountedAmount',
      'paidAmount',
      'remainingBalance',
      'isCarriedForward',
      'status',
      'dueDate',
    ],
    order: [['startDate', 'ASC']],
  })

  const rows = units.map((unit) => {
    const u = unit as PropertyUnit & { floor?: PropertyFloor & { block?: PropertyBlock }; residents?: Resident[] }
    const residents = u.residents ?? []
    // A resident without a move-in date counts from when they were added; one who moved here
    // from another flat, from the first day that flat didn't bill.
    const movedIn = residents.map((r) => startDays.get(r.id) ?? monthStart)
    const movedInDate = movedIn.length ? movedIn.reduce((a, b) => (a < b ? a : b)) : null
    // Moved out only when every billed resident has actually left (off-site residents aren't listed).
    const leftDates = residents.map(
      (r) => toDay(r.moveOutDate) ?? (r.status === ResidentStatus.MOVED_OUT ? localDay(r.updatedAt) : null),
    )
    const movedOutDate =
      residents.length > 0 && leftDates.every((d) => d)
        ? (leftDates as string[]).reduce((a, b) => (a > b ? a : b))
        : null

    const mine = invoices.filter((i) => i.unitId === unit.id)
    const forMonth = mine.filter((i) => String(i.startDate) <= monthEnd && String(i.endDate) >= monthStart)
    const isOpen = (i: Invoice) => (OPEN_INVOICE_STATUSES as readonly InvoiceStatus[]).includes(i.status)
    const residentIds = residents.map((r) => r.id)
    // Own unpaid invoices, less those that went with a household that moved out; plus the unpaid
    // invoices of the flats this household moved here from.
    const openAll = [
      ...mine.filter((i) => isOpen(i) && !windows.some((w) => w.fromUnitId === unit.id && inWindow(i, w))),
      ...[...invoices, ...oldFlatOpen].filter(
        (i) =>
          i.unitId !== unit.id &&
          isOpen(i) &&
          windows.some((w) => residentIds.includes(w.residentId) && inWindow(i, w)),
      ),
    ]

    let monthStatus: MonthBillingStatus
    if (forMonth.length) monthStatus = invoicesStatus(forMonth)
    else if (movedInDate && movedInDate > monthEnd) monthStatus = 'NOT_MOVED_IN'
    else if (movedOutDate && movedOutDate < monthStart) monthStatus = 'MOVED_OUT'
    else monthStatus = 'NOT_BILLED'

    const billed = roundMoney(
      forMonth.reduce(
        (s, i) =>
          s +
          // A carried invoice's balance is billed on the newer invoice; count only what was paid on it.
          (i.isCarriedForward ? Number(i.paidAmount) : Number(i.discountedAmount)),
        0,
      ),
    )
    const paid = roundMoney(forMonth.reduce((s, i) => s + Number(i.paidAmount), 0))
    const coveredFrom = forMonth.length ? forMonth.map((i) => String(i.startDate)).sort()[0]! : null
    const coveredTo = forMonth.length
      ? forMonth
          .map((i) => String(i.endDate))
          .sort()
          .at(-1)!
      : null

    return {
      id: unit.id,
      unitNumber: unit.unit_number,
      blockName: u.floor?.block?.block_name ?? null,
      floorNumber: u.floor?.floor_number ?? null,
      residents: residents.map((r) => ({
        id: r.id,
        name: residentName(r),
        residentType: r.residentType,
        isResiding: r.isResiding,
        phone: r.phone,
      })),
      movedInDate,
      movedOutDate,
      month: {
        status: monthStatus,
        invoices: forMonth.map((i) => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          startDate: String(i.startDate),
          endDate: String(i.endDate),
          status: effectiveStatus(i),
        })),
        billed,
        paid,
        balance: roundMoney(
          forMonth
            .filter((i) => (OPEN_INVOICE_STATUSES as readonly InvoiceStatus[]).includes(i.status))
            .reduce((s, i) => s + Number(i.remainingBalance), 0),
        ),
        // Billed for only part of the days lived there that month (e.g. a custom invoice up to a date).
        partlyBilled:
          !!coveredFrom &&
          (coveredFrom > (movedInDate && movedInDate > monthStart ? movedInDate : monthStart) ||
            (coveredTo ?? monthEnd) < (movedOutDate && movedOutDate < monthEnd ? movedOutDate : monthEnd)),
      },
      lastBilledUntil: mine.length
        ? mine
            .map((i) => String(i.endDate))
            .sort()
            .at(-1)!
        : null,
      outstanding: roundMoney(openAll.reduce((sum, i) => sum + Number(i.remainingBalance), 0)),
    }
  })

  const counts = { ...emptySummary }
  for (const r of rows) counts[r.month.status] += 1
  const filtered = status ? rows.filter((r) => r.month.status === status) : rows
  const earliest = rows
    .map((r) => r.movedInDate)
    .filter((d): d is string => !!d)
    .sort()[0]

  return {
    month,
    earliestMonth: (earliest ?? monthStart).slice(0, 7),
    units: filtered.slice((page.page - 1) * page.limit, page.page * page.limit),
    summary: {
      counts,
      billed: roundMoney(rows.reduce((s, r) => s + r.month.billed, 0)),
      collected: roundMoney(rows.reduce((s, r) => s + r.month.paid, 0)),
      outstanding: roundMoney(rows.reduce((s, r) => s + r.month.balance, 0)),
    },
    pagination: pagination(filtered.length, page),
  }
}

export async function listMiscellaneousItems(unitId: string) {
  const items = await UnitMiscellaneousItem.findAll({
    where: { unitId, isDeleted: false },
    order: [['serviceDate', 'DESC']],
  })
  const billed = await ServicesInvoice.findAll({
    where: { sourceId: items.map((i) => i.id), isDeleted: false },
    include: [
      {
        model: Invoice,
        as: 'invoice',
        attributes: ['invoiceNumber'],
        where: { isDeleted: false, status: { [Op.notIn]: [...VOID_INVOICE_STATUSES] } },
      },
    ],
    attributes: ['sourceId'],
  })
  const billedOn = new Map(
    billed.map((b) => [b.sourceId, (b as ServicesInvoice & { invoice?: Invoice }).invoice?.invoiceNumber ?? null]),
  )
  return items.map((i) => ({ ...i.toJSON(), billedOnInvoice: billedOn.get(i.id) ?? null }))
}
