import type { Transaction } from 'sequelize'
import { Op } from 'sequelize'
import sequelize from '../../config/db/index.js'
import {
  BillingAccount,
  BillingEvent,
  BillingParty,
  BillingProduct,
  BillingSubscription,
  Invoice,
  InvoiceLine,
  Property,
  PropertyUnit,
  Resident,
} from '../../models/index.js'
import {
  BillingEventStatus,
  BillingPartyRole,
  InvoiceLineType,
  InvoiceStatus,
  InvoiceType,
  LedgerEntryType,
  SubscriptionStatus,
} from '../../enums/billing.enum.js'
import { calculateProration } from './proration.service.js'
import { appendLedgerEntry } from './ledger.service.js'

export interface GenerateInvoiceParams {
  billingAccountId: string
  periodStart: string // 'YYYY-MM-DD'
  periodEnd: string // 'YYYY-MM-DD'
  issueDate?: string | undefined
  dueDate?: string | undefined
  isPreview?: boolean | undefined
  includePendingEvents?: boolean | undefined
  billingMode?: 'MONTHLY' | 'SUPPLEMENTARY' | 'FINAL_DISCHARGE' | undefined
  includeSubscriptions?: boolean | undefined
  discountType?: 'FIXED' | 'PERCENTAGE' | undefined
  discountValue?: number | undefined
  performedBy?: string | undefined
}

export interface InvoiceLineItemDraft {
  subscriptionId?: string | null
  billingEventId?: string | null
  productId?: string | null
  lineType: InvoiceLineType
  chargeType: string
  description: string
  serviceDate?: string | null
  consumedByResidentId?: string | null
  quantity: number
  unitPrice: number
  subtotal: number
  discountAmount: number
  taxableAmount: number
  taxRate: number
  taxAmount: number
  totalAmount: number
  sortOrder: number
}

export interface InvoiceDraftResult {
  invoiceNumber?: string
  billingAccountId: string
  unitId: string
  residentId?: string | null
  propertyId: string
  companyId: string
  invoiceType: InvoiceType
  billToName: string
  billToEmail?: string | null
  billToPhone?: string | null
  billToAddress?: string | null
  billToGstin?: string | null
  periodStart: string
  periodEnd: string
  issueDate: string
  dueDate: string
  subtotal: number
  discountTotal: number
  taxableAmount: number
  taxTotal: number
  roundingAdjustment: number
  grandTotal: number
  amountPaid: number
  amountDue: number
  status: InvoiceStatus
  lines: InvoiceLineItemDraft[]
}

/**
 * Generates sequential invoice number: INV-YYYYMM-XXXX
 */
async function generateInvoiceNumber(propertyId: string, issueDate: string, t?: Transaction): Promise<string> {
  const yyyymm = issueDate.replace(/-/g, '').substring(0, 6)
  const prefix = `INV-${yyyymm}-`

  const count = await Invoice.count({
    where: {
      invoiceNumber: {
        [Op.like]: `${prefix}%`,
      },
    },
    ...(t ? { transaction: t } : {}),
  })

  const sequence = String(count + 1).padStart(4, '0')
  return `${prefix}${sequence}`
}

/**
 * Resolves the billing account for a given unit and resident.
 */
export async function resolveBillingAccount(unitId: string, residentId?: string): Promise<BillingAccount | null> {
  // 1. If individual resident account exists for this unit
  if (residentId) {
    const individualAccount = await BillingAccount.findOne({
      where: {
        unitId,
        primaryResidentId: residentId,
        isActive: true,
        isDeleted: false,
      },
    })
    if (individualAccount) return individualAccount
  }

  // 2. Fall back to unit-consolidated account
  return BillingAccount.findOne({
    where: {
      unitId,
      isActive: true,
      isDeleted: false,
    },
    order: [['createdAt', 'ASC']],
  })
}

/**
 * Core invoice generation & preview engine.
 * Computes prorated subscription charges + pending billing events.
 */
export async function generateInvoiceForAccount(
  params: GenerateInvoiceParams,
  externalTx?: Transaction,
): Promise<{ invoice?: Invoice; preview?: InvoiceDraftResult }> {
  const { billingAccountId, periodStart, periodEnd, isPreview = false } = params

  const todayStr = new Date().toISOString().split('T')[0] || ''
  const issueDate = params.issueDate || todayStr

  // Default due date: issueDate + 15 days
  let dueDate = params.dueDate
  if (!dueDate) {
    const due = new Date(issueDate)
    due.setDate(due.getDate() + 15)
    dueDate = due.toISOString().split('T')[0] || todayStr
  }

  // 1. Fetch Billing Account with Parties & Context
  const account = await BillingAccount.findByPk(billingAccountId, {
    include: [
      { model: BillingParty, as: 'parties', where: { isActive: true }, required: false },
      { model: Resident, as: 'primaryResident', required: false },
      { model: PropertyUnit, as: 'unit', required: false },
      { model: Property, as: 'property', required: false },
    ],
  })

  if (!account) {
    throw new Error(`Billing Account ${billingAccountId} not found`)
  }

  // 2. Determine Bill-To Party (Payer Decoupling)
  const parties = account.parties || []
  const primaryPayer =
    parties.find((p) => p.role === BillingPartyRole.PRIMARY_PAYER) ||
    parties.find((p) => p.isDefault) ||
    parties[0]

  const billToName = primaryPayer?.partyName || account.primaryResident?.firstName || account.accountName
  const billToEmail = primaryPayer?.partyEmail || account.primaryResident?.email || null
  const billToPhone = primaryPayer?.partyPhone || account.primaryResident?.phone || null
  const billToAddress = primaryPayer?.partyAddress || null
  const billToGstin = primaryPayer?.partyGstin || null

  // 3. Collect Active Subscriptions for the Account (excluded in SUPPLEMENTARY mode)
  const shouldIncludeSubscriptions =
    params.includeSubscriptions !== false && params.billingMode !== 'SUPPLEMENTARY'

  const subscriptions = shouldIncludeSubscriptions
    ? await BillingSubscription.findAll({
        where: {
          billingAccountId,
          isActive: true,
          status: {
            [Op.in]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAUSED],
          },
          startDate: { [Op.lte]: periodEnd },
          [Op.or]: [{ endDate: null }, { endDate: { [Op.gte]: periodStart } }],
        },
        include: [{ model: BillingProduct, as: 'product' }],
      })
    : []

  const draftLines: InvoiceLineItemDraft[] = []
  let sortOrder = 0

  for (const sub of subscriptions) {
    const proration = calculateProration({
      periodStart,
      periodEnd,
      subscriptionStart: String(sub.startDate),
      subscriptionEnd: sub.endDate ? String(sub.endDate) : null,
      pauseStart: sub.pauseStart ? String(sub.pauseStart) : null,
      pauseEnd: sub.pauseEnd ? String(sub.pauseEnd) : null,
      prorationPolicy: sub.prorationPolicy,
      quantity: Number(sub.quantity),
      unitPrice: Number(sub.unitPrice),
    })

    if (proration.subtotal > 0) {
      sortOrder += 1
      const isTaxable = sub.product?.isTaxable ?? false
      const taxRate = isTaxable ? Number(sub.product?.defaultTaxRate || 0) : 0
      const taxableAmount = isTaxable ? proration.subtotal : 0
      const taxAmount = Number(((taxableAmount * taxRate) / 100).toFixed(2))
      const totalAmount = Number((proration.subtotal + taxAmount).toFixed(2))

      draftLines.push({
        subscriptionId: sub.id,
        productId: sub.productId,
        lineType: InvoiceLineType.SUBSCRIPTION,
        chargeType: sub.product?.productCode || 'SUBSCRIPTION',
        description: sub.description || sub.product?.productName || 'Recurring Subscription',
        quantity: proration.proratedQuantity,
        unitPrice: Number(sub.unitPrice),
        subtotal: proration.subtotal,
        discountAmount: 0,
        taxableAmount,
        taxRate,
        taxAmount,
        totalAmount,
        sortOrder,
      })
    }
  }

  // 4. Collect Pending Usage Events for the Account
  const events =
    params.includePendingEvents !== false
      ? await BillingEvent.findAll({
          where: {
            billingAccountId,
            status: BillingEventStatus.PENDING,
            serviceDate: { [Op.lte]: periodEnd },
          },
          include: [{ model: BillingProduct, as: 'product' }],
          order: [['serviceDate', 'ASC']],
        })
      : []

  for (const ev of events) {
    sortOrder += 1
    const qty = Number(ev.quantity)
    const price = Number(ev.unitPrice)
    const lineSubtotal = Number(ev.amount) > 0 ? Number(ev.amount) : Number((qty * price).toFixed(2))

    const isTaxable = ev.product?.isTaxable ?? false
    const taxRate = isTaxable ? Number(ev.product?.defaultTaxRate || 0) : 0
    const taxableAmount = isTaxable ? lineSubtotal : 0
    const taxAmount = Number(((taxableAmount * taxRate) / 100).toFixed(2))
    const totalAmount = Number((lineSubtotal + taxAmount).toFixed(2))

    draftLines.push({
      billingEventId: ev.id,
      productId: ev.productId || null,
      lineType: InvoiceLineType.USAGE,
      chargeType: ev.chargeType,
      description: ev.description,
      serviceDate: String(ev.serviceDate),
      consumedByResidentId: ev.residentId,
      quantity: qty,
      unitPrice: price,
      subtotal: lineSubtotal,
      discountAmount: 0,
      taxableAmount,
      taxRate,
      taxAmount,
      totalAmount,
      sortOrder,
    })
  }

  // 5. Aggregate Totals & Discount Calculation
  const subtotal = Number(draftLines.reduce((sum, l) => sum + l.subtotal, 0).toFixed(2))

  let discountTotal = 0
  if (params.discountValue && params.discountValue > 0) {
    if (params.discountType === 'PERCENTAGE') {
      discountTotal = Number(((subtotal * params.discountValue) / 100).toFixed(2))
    } else {
      discountTotal = Number(Number(params.discountValue).toFixed(2))
    }
    if (discountTotal > subtotal) {
      discountTotal = subtotal
    }
  }

  const rawTaxableAmount = Number(draftLines.reduce((sum, l) => sum + l.taxableAmount, 0).toFixed(2))
  const taxableAmount = Math.max(0, Number((rawTaxableAmount - discountTotal).toFixed(2)))

  const effectiveTaxFactor = rawTaxableAmount > 0 ? taxableAmount / rawTaxableAmount : 1
  const rawTaxTotal = Number(draftLines.reduce((sum, l) => sum + l.taxAmount, 0).toFixed(2))
  const taxTotal = Number((rawTaxTotal * effectiveTaxFactor).toFixed(2))

  const rawTotal = subtotal - discountTotal + taxTotal
  const grandTotal = Math.round(rawTotal)
  const roundingAdjustment = Number((grandTotal - rawTotal).toFixed(2))
  const amountPaid = 0
  const amountDue = grandTotal

  const invoiceDraft: InvoiceDraftResult = {
    billingAccountId,
    unitId: account.unitId,
    residentId: account.primaryResidentId || null,
    propertyId: account.propertyId,
    companyId: account.companyId,
    invoiceType: InvoiceType.INVOICE,
    billToName,
    billToEmail,
    billToPhone,
    billToAddress,
    billToGstin,
    periodStart,
    periodEnd,
    issueDate,
    dueDate,
    subtotal,
    discountTotal,
    taxableAmount,
    taxTotal,
    roundingAdjustment,
    grandTotal,
    amountPaid,
    amountDue,
    status: isPreview ? InvoiceStatus.PREVIEW : InvoiceStatus.FINALIZED,
    lines: draftLines,
  }

  // 6. Return preview if requested
  if (isPreview) {
    return { preview: invoiceDraft }
  }

  // 7. Persist Invoice + Lines + Ledger within a Transaction
  const executeFinalize = async (t: Transaction) => {
    const invoiceNumber = await generateInvoiceNumber(account.propertyId, issueDate, t)

    const invoice = await Invoice.create(
      {
        invoiceNumber,
        billingAccountId,
        unitId: account.unitId,
        residentId: account.primaryResidentId || null,
        propertyId: account.propertyId,
        companyId: account.companyId,
        invoiceType: InvoiceType.INVOICE,
        billToName,
        billToEmail,
        billToPhone,
        billToAddress,
        billToGstin,
        periodStart,
        periodEnd,
        issueDate,
        dueDate,
        subtotal,
        discountTotal,
        taxableAmount,
        taxTotal,
        roundingAdjustment,
        grandTotal,
        amountPaid: 0,
        amountDue: grandTotal,
        status: InvoiceStatus.FINALIZED,
        finalizedAt: new Date(),
        currency: account.currency || 'INR',
      },
      { transaction: t },
    )

    // Insert invoice lines
    for (const line of draftLines) {
      const createdLine = await InvoiceLine.create(
        {
          invoiceId: invoice.id,
          subscriptionId: line.subscriptionId || null,
          billingEventId: line.billingEventId || null,
          productId: line.productId || null,
          lineType: line.lineType,
          chargeType: line.chargeType,
          description: line.description,
          serviceDate: line.serviceDate || null,
          consumedByResidentId: line.consumedByResidentId || null,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          subtotal: line.subtotal,
          discountAmount: line.discountAmount,
          taxableAmount: line.taxableAmount,
          taxRate: line.taxRate,
          taxAmount: line.taxAmount,
          totalAmount: line.totalAmount,
          sortOrder: line.sortOrder,
        },
        { transaction: t },
      )

      // If linked to a billing event, mark the event as invoiced
      if (line.billingEventId) {
        await BillingEvent.update(
          {
            status: BillingEventStatus.INVOICED,
            invoiceId: invoice.id,
            invoiceLineId: createdLine.id,
          },
          { where: { id: line.billingEventId }, transaction: t },
        )
      }
    }

    // Append to sacred ledger
    await appendLedgerEntry(
      {
        billingAccountId,
        unitId: account.unitId,
        entryType: LedgerEntryType.INVOICE,
        referenceType: 'billing_invoices',
        referenceId: invoice.id,
        debitAmount: grandTotal,
        creditAmount: 0,
        description: `Invoice #${invoiceNumber} (${periodStart} to ${periodEnd})`,
        entryDate: issueDate,
      },
      t,
    )

    const fullInvoice = await Invoice.findByPk(invoice.id, {
      include: [{ model: InvoiceLine, as: 'lines' }],
      transaction: t,
    })

    return { invoice: fullInvoice || invoice }
  }

  if (externalTx) {
    return executeFinalize(externalTx)
  }

  return sequelize.transaction(executeFinalize)
}
