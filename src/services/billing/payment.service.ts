import type { Transaction } from 'sequelize'
import { Op } from 'sequelize'
import sequelize from '../../config/db/index.js'
import { BillingAccount, Invoice, Payment, PaymentAllocation } from '../../models/index.js'
import { InvoiceStatus, LedgerEntryType, PaymentMethod, PaymentStatus } from '../../enums/billing.enum.js'
import { appendLedgerEntry } from './ledger.service.js'

export interface PaymentAllocationItem {
  invoiceId: string
  amount: number
}

export interface RecordPaymentParams {
  billingAccountId: string
  amount: number
  paymentDate: string // 'YYYY-MM-DD'
  paymentMethod: PaymentMethod
  transactionReference?: string | null | undefined
  bankName?: string | null | undefined
  chequeNumber?: string | null | undefined
  notes?: string | null | undefined
  allocations: PaymentAllocationItem[]
  performedBy?: string | undefined
}

/**
 * Generates sequential payment receipt number: REC-YYYYMM-XXXX
 */
export async function generatePaymentNumber(paymentDate: string, t?: Transaction): Promise<string> {
  const yyyymm = paymentDate.replace(/-/g, '').substring(0, 6)
  const prefix = `REC-${yyyymm}-`

  const count = await Payment.count({
    where: {
      paymentNumber: {
        [Op.like]: `${prefix}%`,
      },
    },
    ...(t ? { transaction: t } : {}),
  })

  const sequence = String(count + 1).padStart(4, '0')
  return `${prefix}${sequence}`
}

/**
 * Records a payment against a billing account and allocates funds to invoices.
 * ⚠️ Enforces ACID transaction, ledger append-only consistency, and invoice balance reconciliation.
 */
export async function recordPayment(params: RecordPaymentParams): Promise<{
  payment: Payment
  allocations: PaymentAllocation[]
  updatedInvoices: Invoice[]
}> {
  return sequelize.transaction(async (t) => {
    // 1. Fetch and lock the billing account
    const account = await BillingAccount.findByPk(params.billingAccountId, {
      lock: t.LOCK.UPDATE,
      transaction: t,
    })
    if (!account) {
      throw new Error(`Billing account ${params.billingAccountId} not found`)
    }

    const totalAmount = Number(Number(params.amount).toFixed(2))
    if (totalAmount <= 0) {
      throw new Error('Payment amount must be greater than 0')
    }

    // 2. Validate allocations sum against received payment amount
    const allocatedSum = Number(params.allocations.reduce((sum, item) => sum + Number(item.amount), 0).toFixed(2))
    if (allocatedSum > totalAmount) {
      throw new Error(
        `Total allocated amount (₹${allocatedSum}) cannot exceed received payment amount (₹${totalAmount})`,
      )
    }

    // 3. Generate sequential receipt number
    const paymentNumber = await generatePaymentNumber(params.paymentDate, t)

    // 4. Create Payment record
    const payment = await Payment.create(
      {
        paymentNumber,
        billingAccountId: account.id,
        unitId: account.unitId,
        propertyId: account.propertyId,
        companyId: account.companyId,
        paymentDate: params.paymentDate,
        amount: totalAmount,
        currency: account.currency || 'INR',
        paymentMethod: params.paymentMethod,
        transactionReference: params.transactionReference || null,
        bankName: params.bankName || null,
        chequeNumber: params.chequeNumber || null,
        status: PaymentStatus.CONFIRMED,
        confirmedAt: new Date(),
        receivedBy: params.performedBy || null,
        notes: params.notes || null,
        createdBy: params.performedBy || null,
      },
      { transaction: t },
    )

    // 5. Apply Allocations to Invoices
    const createdAllocations: PaymentAllocation[] = []
    const updatedInvoices: Invoice[] = []

    for (const item of params.allocations) {
      const allocAmount = Number(Number(item.amount).toFixed(2))
      if (allocAmount <= 0) continue

      const invoice = await Invoice.findByPk(item.invoiceId, {
        lock: t.LOCK.UPDATE,
        transaction: t,
      })

      if (!invoice) {
        throw new Error(`Invoice ${item.invoiceId} not found`)
      }
      if (invoice.billingAccountId !== account.id) {
        throw new Error(`Invoice ${invoice.invoiceNumber} does not belong to this billing account`)
      }
      if (invoice.status === InvoiceStatus.CANCELLED) {
        throw new Error(`Cannot apply payment to cancelled invoice ${invoice.invoiceNumber}`)
      }

      const currentDue = Number(invoice.amountDue)
      if (allocAmount > currentDue) {
        throw new Error(
          `Allocated amount ₹${allocAmount} exceeds invoice ${invoice.invoiceNumber} balance due of ₹${currentDue}`,
        )
      }

      const newPaid = Number((Number(invoice.amountPaid) + allocAmount).toFixed(2))
      const newDue = Number((Number(invoice.grandTotal) - newPaid).toFixed(2))
      const isFullyPaid = newDue <= 0

      await invoice.update(
        {
          amountPaid: newPaid,
          amountDue: Math.max(0, newDue),
          status: isFullyPaid ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID,
          paidAt: isFullyPaid ? new Date() : invoice.paidAt,
        },
        { transaction: t },
      )

      const allocation = await PaymentAllocation.create(
        {
          paymentId: payment.id,
          invoiceId: invoice.id,
          billingAccountId: account.id,
          allocatedAmount: allocAmount,
          allocationDate: params.paymentDate,
        },
        { transaction: t },
      )

      createdAllocations.push(allocation)
      updatedInvoices.push(invoice)
    }

    // 6. Append to Sacred Ledger (Credit customer balance)
    await appendLedgerEntry(
      {
        billingAccountId: account.id,
        unitId: account.unitId,
        entryType: LedgerEntryType.PAYMENT,
        referenceType: 'payments',
        referenceId: payment.id,
        debitAmount: 0,
        creditAmount: totalAmount,
        description: `Payment received #${paymentNumber} (${params.paymentMethod}${
          params.transactionReference ? ` - Ref: ${params.transactionReference}` : ''
        })`,
        entryDate: params.paymentDate,
      },
      t,
    )

    return {
      payment,
      allocations: createdAllocations,
      updatedInvoices,
    }
  })
}

/**
 * Returns all payments and their allocations for an account.
 */
export async function getAccountPayments(billingAccountId: string): Promise<Payment[]> {
  return Payment.findAll({
    where: { billingAccountId },
    include: [
      {
        model: PaymentAllocation,
        as: 'allocations',
        include: [{ model: Invoice, as: 'invoice' }],
      },
    ],
    order: [
      ['paymentDate', 'DESC'],
      ['createdAt', 'DESC'],
    ],
  })
}
