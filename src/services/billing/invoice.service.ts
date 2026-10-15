import { Op, UniqueConstraintError, type Transaction } from 'sequelize'
import sequelize from '../../config/db/index.js'
import {
  BillingMode,
  InvoiceStatus,
  OPEN_INVOICE_STATUSES,
  PaymentMethod,
  ServiceType,
  VOID_INVOICE_STATUSES,
  CARRIED_INVOICE_STATUSES,
} from '../../enums/billing.enum.js'
import {
  CarriedForwardInvoice,
  Invoice,
  InvoiceDocument,
  MiscellaneousBilling,
  PropertyUnit,
  Receipt,
  ReceiptAllocation,
  ServicesInvoice,
} from '../../models/index.js'
import { addDays, roundMoney, todayDay } from '../../utils/billing/dates.js'
import { generateInvoiceNumber, generateReceiptNumber } from '../../utils/billing/numbering.js'
import { BillingError } from './context.js'
import { getTaxConfig } from './tax.service.js'
import { buildInvoicePreview } from './invoiceBuilder.service.js'
import type { InvoiceBillTo } from '../../models/invoice.model.js'
import type { ServiceLine } from './types.js'

const DEFAULT_DUE_DAYS = 15

export interface MiscellaneousServiceInput {
  name: string
  description?: string | null | undefined
  quantity: number
  price: number
  isCarryForward?: boolean | undefined
  originalInvoiceId?: string | null | undefined
}

export interface SaveInvoiceInput {
  billingMode: BillingMode
  startDate?: string | undefined
  endDate?: string | undefined
  /** Ids of the preview lines to bill. */
  selectedServices: string[]
  miscellaneousServices?: MiscellaneousServiceInput[] | undefined
  discountType?: 'percentage' | 'amount' | null | undefined
  discountValue?: number | null | undefined
  discountReason?: string | null | undefined
  dueDate?: string | null | undefined
  notes?: string | null | undefined
}

export interface RecordPaymentInput {
  paidAmount: number
  paymentMethod: PaymentMethod
  paymentReference?: string | null | undefined
  notes?: string | null | undefined
  handedOverTo?: string | null | undefined
  imageUrl?: string | null | undefined
}

const isUniqueViolation = (err: unknown) => err instanceof UniqueConstraintError

/** Serialises billing writes for one flat. */
const lockUnit = (unitId: string, transaction: Transaction) =>
  PropertyUnit.findByPk(unitId, { transaction, lock: transaction.LOCK.UPDATE, attributes: ['id'] })

function computeDiscount(total: number, input: SaveInvoiceInput) {
  const value = input.discountValue
  if (!input.discountType || value === null || value === undefined || value === 0) {
    return { discount: 0, discountPercentage: null, discountAmount: null }
  }
  if (input.discountType === 'percentage') {
    if (value < 0 || value > 100) throw new BillingError('Discount percentage must be between 0 and 100')
    return { discount: roundMoney((Math.abs(total) * value) / 100), discountPercentage: value, discountAmount: null }
  }
  if (value < 0) throw new BillingError('Discount amount must be positive')
  const discount = roundMoney(total >= 0 ? Math.min(value, total) : value)
  return { discount, discountPercentage: null, discountAmount: discount }
}

const carryForwardLine = (inv: Invoice, balance: number): ServiceLine => ({
  id: `${ServiceType.CARRY_FORWARD}:${inv.id}`,
  serviceType: ServiceType.CARRY_FORWARD,
  type: ServiceType.CARRY_FORWARD,
  name: `Previous balance carried forward (${inv.invoiceNumber})`,
  description: `Unpaid balance of ${inv.invoiceNumber} (${inv.startDate} to ${inv.endDate})`,
  quantity: 1,
  price: balance,
  total: balance,
  residentId: null,
  familyMemberId: null,
  consumerType: null,
  consumerName: null,
  sourceId: inv.id,
  serviceStartDate: String(inv.startDate),
  serviceEndDate: String(inv.endDate),
  date: String(inv.startDate),
  isAdjustment: false,
})

/**
 * Lines to save: the selected preview lines, misc lines, and a carry-forward line for every
 * earlier invoice still Pending (nothing paid). Partly paid / overdue invoices are not carried.
 */
async function assembleLines(
  invoice: { unitId: string; startDate: string; excludeInvoiceId?: string },
  services: ServiceLine[],
  input: SaveInvoiceInput,
  transaction: Transaction,
): Promise<{ lines: ServiceLine[]; misc: MiscellaneousServiceInput[]; carried: Invoice[] }> {
  const selected = new Set(input.selectedServices)
  // Prices come from the source modules and are not editable on the invoice.
  const lines = services.filter((s) => selected.has(s.id))
  const misc = (input.miscellaneousServices ?? []).filter((m) => !m.isCarryForward && !m.originalInvoiceId)

  const carried = (
    await Invoice.findAll({
      where: {
        unitId: invoice.unitId,
        isDeleted: false,
        status: InvoiceStatus.PENDING,
        endDate: { [Op.lt]: invoice.startDate },
        ...(invoice.excludeInvoiceId ? { id: { [Op.ne]: invoice.excludeInvoiceId } } : {}),
      },
      order: [['startDate', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
    })
  ).filter((inv) => Number(inv.paidAmount) === 0 && Number(inv.discountedAmount) > 0)
  // The carried amount is always the source invoice's current balance, never a client value.
  for (const inv of carried) lines.push(carryForwardLine(inv, roundMoney(Number(inv.discountedAmount))))
  return { lines, misc, carried }
}

async function writeInvoiceContents(
  invoice: Invoice,
  lines: ServiceLine[],
  misc: MiscellaneousServiceInput[],
  carried: Invoice[],
  userId: string | null,
  transaction: Transaction,
) {
  const today = todayDay()
  await ServicesInvoice.bulkCreate(
    lines.map((l) => ({
      invoiceId: invoice.id,
      serviceType: l.serviceType,
      name: l.name,
      description: l.description,
      quantity: l.quantity,
      price: l.price,
      total: l.total,
      residentId: l.residentId,
      familyMemberId: l.familyMemberId,
      consumerType: l.consumerType,
      consumerName: l.consumerName,
      sourceId: l.sourceId,
      serviceStartDate: l.serviceStartDate,
      serviceEndDate: l.serviceEndDate,
      isAdjustment: l.isAdjustment,
      createdBy: userId,
    })),
    { transaction },
  )
  for (const m of misc) {
    const quantity = Number(m.quantity)
    const price = Number(m.price)
    const total = roundMoney(quantity * price)
    const description = m.description ? `${m.description} (on ${today})` : `Miscellaneous item (on ${today})`
    await MiscellaneousBilling.create(
      { invoiceId: invoice.id, name: m.name, description, quantity, price, total, createdBy: userId },
      { transaction },
    )
    await ServicesInvoice.create(
      {
        invoiceId: invoice.id,
        serviceType: ServiceType.MISCELLANEOUS_AT_BILLING,
        name: m.name,
        description,
        quantity,
        price,
        total,
        serviceStartDate: today,
        serviceEndDate: today,
        createdBy: userId,
      },
      { transaction },
    )
  }
  for (const src of carried) {
    const originalTotal = Number(src.discountedAmount)
    const originalPaid = Number(src.paidAmount)
    await CarriedForwardInvoice.create(
      {
        targetInvoiceId: invoice.id,
        sourceInvoiceId: src.id,
        unitId: invoice.unitId,
        propertyId: invoice.propertyId,
        carriedAmount: roundMoney(originalTotal - originalPaid),
        originalTotal,
        originalPaid,
        sourceStatus: src.status,
        createdBy: userId,
      },
      { transaction },
    )
    // Permanently obsolete: its balance now lives on this invoice.
    await src.update(
      { status: InvoiceStatus.OBSOLETE, remainingBalance: 0, isCarriedForward: true, updatedBy: userId },
      { transaction },
    )
  }
}

/**
 * Subtotal of this period's charges, less discount, plus GST on what remains (CGST + SGST split
 * equally, rate from Global Settings → Tax). Carried-forward balances are added after that: they
 * already include their own discount and GST.
 */
async function invoiceTotals(lines: ServiceLine[], misc: MiscellaneousServiceInput[], input: SaveInvoiceInput) {
  const isCarried = (l: ServiceLine) => l.serviceType === ServiceType.CARRY_FORWARD
  const carriedForwardAmount = roundMoney(lines.filter(isCarried).reduce((sum, l) => sum + l.total, 0))
  const subtotal = roundMoney(
    lines.filter((l) => !isCarried(l)).reduce((sum, l) => sum + l.total, 0) +
      misc.reduce((sum, m) => sum + Number(m.quantity) * Number(m.price), 0),
  )
  const { discount, discountPercentage, discountAmount } = computeDiscount(subtotal, input)
  const taxable = Math.max(0, roundMoney(subtotal - discount))
  const config = await getTaxConfig()
  const cgst = config.gstEnabled ? roundMoney((taxable * config.cgstRate) / 100) : 0
  const sgst = config.gstEnabled ? roundMoney((taxable * config.sgstRate) / 100) : 0
  const tax = roundMoney(cgst + sgst)
  const discountedAmount = roundMoney(subtotal - discount + tax + carriedForwardAmount)
  return {
    subtotal,
    tax,
    discount,
    discountPercentage,
    discountAmount,
    discountReason: discount ? (input.discountReason ?? null) : null,
    carriedForwardAmount,
    discountedAmount,
    total: discountedAmount,
    gstNumber: config.gstEnabled ? config.gstNumber || null : null,
    gstRate: config.gstEnabled ? config.rate : null,
    cgstRate: config.gstEnabled ? config.cgstRate : null,
    sgstRate: config.gstEnabled ? config.sgstRate : null,
    taxableAmount: config.gstEnabled ? taxable : null,
    cgstAmount: config.gstEnabled ? cgst : null,
    sgstAmount: config.gstEnabled ? sgst : null,
  }
}

/** Unpaid: the whole amount is due. Nothing to pay: settled straight away. */
const openingBalance = (discountedAmount: number) => ({
  status: discountedAmount <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PENDING,
  remainingBalance: Math.max(0, discountedAmount),
})

const billToColumns = (billTo: InvoiceBillTo) => ({
  billToResidentId: billTo.residentId,
  billToName: billTo.name || null,
  billToPhone: billTo.phone,
  billToEmail: billTo.email,
  billToUnitNumber: billTo.unitNumber || null,
})

export async function createInvoice(unitId: string, input: SaveInvoiceInput, userId: string | null): Promise<Invoice> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await sequelize.transaction(async (transaction) => {
        await lockUnit(unitId, transaction)
        const preview = await buildInvoicePreview({
          unitId,
          billingMode: input.billingMode,
          startDate: input.startDate,
          endDate: input.endDate,
          transaction,
        })
        if (preview.overlappingInvoice) {
          throw new BillingError(
            `Invoice ${preview.overlappingInvoice.invoiceNumber} already covers ${preview.overlappingInvoice.startDate} to ${preview.overlappingInvoice.endDate}`,
            409,
          )
        }
        // A month's bill is made in that month: next month's can be previewed but not generated yet.
        if (input.billingMode === BillingMode.MONTHLY && preview.startDate.slice(0, 7) > todayDay().slice(0, 7)) {
          const first = new Date(`${preview.startDate.slice(0, 7)}-01T00:00:00Z`)
          const fmt = (opts: Intl.DateTimeFormatOptions) => first.toLocaleString('en-IN', { ...opts, timeZone: 'UTC' })
          throw new BillingError(
            `The ${fmt({ month: 'long', year: 'numeric' })} invoice can be generated from ${fmt({ day: '2-digit', month: 'short', year: 'numeric' })}`,
          )
        }
        const { lines, misc, carried } = await assembleLines(
          { unitId, startDate: preview.startDate },
          preview.services,
          input,
          transaction,
        )
        if (!lines.length && !misc.length) throw new BillingError('Select at least one service to bill')

        const totals = await invoiceTotals(lines, misc, input)
        const invoice = await Invoice.create(
          {
            invoiceNumber: await generateInvoiceNumber(preview.unitNumber, transaction),
            unitId,
            propertyId: preview.propertyId,
            ...billToColumns(preview.billTo),
            startDate: preview.startDate,
            endDate: preview.endDate,
            ...totals,
            ...openingBalance(totals.discountedAmount),
            currency: 'INR',
            billingMode: input.billingMode,
            dueDate: input.dueDate || addDays(todayDay(), DEFAULT_DUE_DAYS),
            paidAmount: 0,
            notes: input.notes ?? null,
            createdBy: userId,
          },
          { transaction },
        )
        await writeInvoiceContents(invoice, lines, misc, carried, userId, transaction)
        return invoice
      })
    } catch (err) {
      // Two flats with the same number in different properties can race for a sequence.
      if (isUniqueViolation(err) && attempt < 2) continue
      throw err
    }
  }
}

async function findEditableInvoice(invoiceWhere: Record<string, unknown>, transaction: Transaction) {
  const invoice = await Invoice.findOne({ where: { ...invoiceWhere, isDeleted: false }, transaction })
  if (!invoice) throw new BillingError('Invoice not found', 404)
  const receipts = await Receipt.count({ where: { invoiceId: invoice.id, isDeleted: false }, transaction })
  if (Number(invoice.paidAmount) > 0 || receipts > 0) {
    throw new BillingError('An invoice with payments recorded against it cannot be changed')
  }
  const locked: readonly InvoiceStatus[] = [...CARRIED_INVOICE_STATUSES, ...VOID_INVOICE_STATUSES]
  if (invoice.isCarriedForward) {
    throw new BillingError('This invoice was carried into a newer invoice and cannot be changed')
  }
  if (locked.includes(invoice.status)) {
    throw new BillingError(`This invoice is ${invoice.status.toLowerCase().replace('_', ' ')} and cannot be changed`)
  }
  return invoice
}

/** Rebuilds an unpaid invoice from the current source data (same number, new lines). */
export async function updateInvoice(
  invoiceId: string,
  propertyId: string | null,
  input: SaveInvoiceInput,
  userId: string | null,
): Promise<Invoice> {
  return sequelize.transaction(async (transaction) => {
    const invoice = await findEditableInvoice({ id: invoiceId, ...(propertyId ? { propertyId } : {}) }, transaction)
    await lockUnit(invoice.unitId, transaction)
    // Invoices already carried into this one stay carried (obsolete for good): keep their lines.
    const keptCarried = await ServicesInvoice.findAll({
      where: { invoiceId: invoice.id, serviceType: ServiceType.CARRY_FORWARD, isDeleted: false },
      transaction,
    })
    await ServicesInvoice.destroy({ where: { invoiceId: invoice.id }, transaction })
    await MiscellaneousBilling.destroy({ where: { invoiceId: invoice.id }, transaction })

    const preview = await buildInvoicePreview({
      unitId: invoice.unitId,
      billingMode: input.billingMode,
      startDate: input.startDate,
      endDate: input.endDate,
      excludeInvoiceId: invoice.id,
      transaction,
    })
    if (preview.overlappingInvoice) {
      throw new BillingError(
        `Invoice ${preview.overlappingInvoice.invoiceNumber} already covers part of this period`,
        409,
      )
    }
    const { lines, misc, carried } = await assembleLines(
      { unitId: invoice.unitId, startDate: preview.startDate, excludeInvoiceId: invoice.id },
      preview.services,
      input,
      transaction,
    )
    for (const l of keptCarried) {
      lines.push({
        id: `${ServiceType.CARRY_FORWARD}:${l.sourceId}`,
        serviceType: ServiceType.CARRY_FORWARD,
        type: ServiceType.CARRY_FORWARD,
        name: l.name,
        description: l.description ?? '',
        quantity: Number(l.quantity),
        price: Number(l.price),
        total: Number(l.total),
        residentId: null,
        familyMemberId: null,
        consumerType: null,
        consumerName: null,
        sourceId: l.sourceId ?? '',
        serviceStartDate: l.serviceStartDate ?? '',
        serviceEndDate: l.serviceEndDate ?? '',
        date: l.serviceStartDate ?? '',
        isAdjustment: false,
      })
    }
    if (!lines.length && !misc.length) throw new BillingError('Select at least one service to bill')

    const totals = await invoiceTotals(lines, misc, input)
    await invoice.update(
      {
        startDate: preview.startDate,
        endDate: preview.endDate,
        ...billToColumns(preview.billTo),
        ...totals,
        ...openingBalance(totals.discountedAmount),
        billingMode: input.billingMode,
        dueDate: input.dueDate || invoice.dueDate,
        notes: input.notes ?? invoice.notes,
        updatedBy: userId,
      },
      { transaction },
    )
    await writeInvoiceContents(invoice, lines, misc, carried, userId, transaction)
    // Any saved PDF now describes the old contents.
    await InvoiceDocument.update({ isDeleted: true }, { where: { invoiceId: invoice.id }, transaction })
    return invoice
  })
}

interface Allocation {
  invoiceId: string
  amount: number
}

/** Paid so far towards an invoice: its own receipts plus what reached it through newer invoices. */
async function settledAmount(invoiceId: string, transaction: Transaction) {
  const total = await ReceiptAllocation.sum('amount', { where: { invoiceId }, transaction })
  return roundMoney(Number(total || 0))
}

/**
 * Splits a payment on an invoice: the balances it carries are settled first, oldest first, each
 * up to what is still unpaid on it (and on through what that one carries), then its own charges.
 * The invoice itself gets a row for the whole amount; each carried invoice reached gets its share.
 */
async function planAllocation(invoiceId: string, amount: number, transaction: Transaction): Promise<Allocation[]> {
  const rows: Allocation[] = [{ invoiceId, amount }]
  const carried = await CarriedForwardInvoice.findAll({
    where: { targetInvoiceId: invoiceId },
    include: [{ model: Invoice, as: 'sourceInvoice', attributes: ['id', 'startDate'] }],
    transaction,
  })
  const sourceStart = (c: CarriedForwardInvoice) =>
    String((c as CarriedForwardInvoice & { sourceInvoice?: Invoice }).sourceInvoice?.startDate ?? '')
  carried.sort((a, b) => sourceStart(a).localeCompare(sourceStart(b)))

  let left = amount
  for (const c of carried) {
    if (left <= 0) break
    const due = roundMoney(Number(c.carriedAmount) - (await settledAmount(c.sourceInvoiceId, transaction)))
    const take = roundMoney(Math.min(due, left))
    if (take <= 0) continue
    rows.push(...(await planAllocation(c.sourceInvoiceId, take, transaction)))
    left = roundMoney(left - take)
  }
  return rows
}

/** Carried invoices whose carried balance is now fully paid through newer invoices become PAID. */
async function settleCarriedInvoices(invoiceIds: string[], userId: string | null, transaction: Transaction) {
  for (const invoiceId of invoiceIds) {
    const link = await CarriedForwardInvoice.findOne({ where: { sourceInvoiceId: invoiceId }, transaction })
    if (!link) continue
    if ((await settledAmount(invoiceId, transaction)) + 0.004 < Number(link.carriedAmount)) continue
    await Invoice.update(
      { status: InvoiceStatus.PAID, remainingBalance: 0, updatedBy: userId },
      { where: { id: invoiceId, status: { [Op.ne]: InvoiceStatus.PAID } }, transaction },
    )
  }
}

export async function recordPayment(
  invoiceId: string,
  propertyId: string | null,
  input: RecordPaymentInput,
  userId: string | null,
): Promise<{ invoice: Invoice; receipt: Receipt }> {
  return sequelize.transaction(async (transaction) => {
    const invoice = await Invoice.findOne({
      where: { id: invoiceId, isDeleted: false, ...(propertyId ? { propertyId } : {}) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    })
    if (!invoice) throw new BillingError('Invoice not found', 404)
    if (!(OPEN_INVOICE_STATUSES as readonly InvoiceStatus[]).includes(invoice.status)) {
      throw new BillingError(
        `Payments cannot be recorded: this invoice is ${invoice.status.toLowerCase().replace('_', ' ')}`,
      )
    }

    const amount = roundMoney(Number(input.paidAmount))
    const paidBefore = Number(invoice.paidAmount)
    const remaining = roundMoney(Number(invoice.discountedAmount) - paidBefore)
    if (amount <= 0) throw new BillingError('Paid amount must be greater than 0')
    if (Math.round(amount * 100) > Math.round(remaining * 100)) {
      throw new BillingError(`Paid amount (${amount}) cannot exceed the remaining amount (${remaining.toFixed(2)})`)
    }

    const newPaid = roundMoney(paidBefore + amount)
    const newRemaining = Math.max(0, roundMoney(Number(invoice.discountedAmount) - newPaid))
    const status = newRemaining <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID
    await invoice.update(
      {
        paidAmount: newPaid,
        remainingBalance: newRemaining,
        status,
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference ?? null,
        updatedBy: userId,
      },
      { transaction },
    )

    const unit = await PropertyUnit.findByPk(invoice.unitId, { attributes: ['unit_number'], transaction })
    const receipt = await Receipt.create(
      {
        receiptNumber: await generateReceiptNumber(unit?.unit_number ?? '', transaction),
        invoiceId: invoice.id,
        unitId: invoice.unitId,
        paidAmount: amount,
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference ?? null,
        notes: input.notes ?? null,
        handedOverTo: input.handedOverTo ?? null,
        invoiceTotal: Number(invoice.discountedAmount),
        paidBefore,
        invoiceRemainingBalance: newRemaining,
        invoiceStatus: status,
        imageUrl: input.imageUrl ?? null,
        createdBy: userId,
      },
      { transaction },
    )

    const allocations = await planAllocation(invoice.id, amount, transaction)
    await ReceiptAllocation.bulkCreate(
      allocations.map((a) => ({ receiptId: receipt.id, invoiceId: a.invoiceId, amount: a.amount, createdBy: userId })),
      { transaction },
    )
    await settleCarriedInvoices(
      allocations.filter((a) => a.invoiceId !== invoice.id).map((a) => a.invoiceId),
      userId,
      transaction,
    )
    return { invoice, receipt }
  })
}
