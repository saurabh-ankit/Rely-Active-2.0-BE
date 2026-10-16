import { Op, type Transaction } from 'sequelize'
import { Invoice, Receipt } from '../../models/index.js'
import { financialYear } from './dates.js'

const unitCode = (unitNumber: string): string => (unitNumber || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'UNIT'

const nextSequence = (existing: string[], prefix: string): number =>
  existing.reduce((max, num) => {
    const seq = parseInt(num.slice(prefix.length), 10)
    return Number.isNaN(seq) ? max : Math.max(max, seq)
  }, 0) + 1

/** INV-{FY}-{flat}-{seq}, e.g. INV-2026-27-A101-003 (sequence per flat per financial year). */
export async function generateInvoiceNumber(unitNumber: string, transaction?: Transaction): Promise<string> {
  const prefix = `INV-${financialYear()}-${unitCode(unitNumber)}-`
  const rows = await Invoice.findAll({
    where: { invoiceNumber: { [Op.like]: `${prefix}%` } },
    attributes: ['invoiceNumber'],
    transaction: transaction ?? null,
  })
  return `${prefix}${String(
    nextSequence(
      rows.map((r) => r.invoiceNumber),
      prefix,
    ),
  ).padStart(3, '0')}`
}

/** RCP-{FY}-{flat}-{seq}. */
export async function generateReceiptNumber(unitNumber: string, transaction?: Transaction): Promise<string> {
  const prefix = `RCP-${financialYear()}-${unitCode(unitNumber)}-`
  const rows = await Receipt.findAll({
    where: { receiptNumber: { [Op.like]: `${prefix}%` } },
    attributes: ['receiptNumber'],
    transaction: transaction ?? null,
  })
  return `${prefix}${String(
    nextSequence(
      rows.map((r) => r.receiptNumber),
      prefix,
    ),
  ).padStart(3, '0')}`
}
