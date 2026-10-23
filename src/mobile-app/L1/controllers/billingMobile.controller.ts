import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { logger } from '../../../config/logger.js'
import { Invoice, Resident, ResidentFamilyMember } from '../../../models/index.js'
import { InvoiceDocumentType, InvoiceStatus } from '../../../enums/billing.enum.js'
import { BILLABLE_RESIDENT_WHERE, BillingError } from '../../../services/billing/context.js'
import { previousFlatInvoices } from '../../../services/billing/movedInvoices.js'
import { getInvoiceById, getUnitInvoices } from '../../../services/billing/billingQuery.service.js'
import { ensureInvoicePdf, ensureReceiptPdf } from '../../../services/billing/billingPdf.service.js'

/**
 * Bills are visible to the flat's residents and to family members, but only while they
 * live in the flat (isResiding). Returns the flat the caller may see.
 */
async function callerUnitId(req: AuthenticatedRequest): Promise<string> {
  const roles = req.user?.roles ?? []
  if (roles.includes('RESIDENT_FAMILY_MEMBER')) {
    const member = await ResidentFamilyMember.findByPk(req.user?.familyMemberId ?? req.user?.id ?? '', {
      include: [{ model: Resident, as: 'resident', attributes: ['id', 'unitId', 'isDeleted'] }],
    })
    const resident = (member as (ResidentFamilyMember & { resident?: Resident }) | null)?.resident
    if (!member || member.isDeleted || !member.isResiding || !resident || resident.isDeleted) {
      throw new BillingError('Bills are only available to family members living in the flat', 403)
    }
    return resident.unitId
  }
  if (roles.includes('RESIDENT') && req.user?.residentId) {
    const resident = await Resident.findByPk(req.user.residentId, { attributes: ['id', 'unitId', 'isResiding'] })
    if (!resident || !resident.isResiding) {
      throw new BillingError('Bills are only available to residents living in the flat', 403)
    }
    return resident.unitId
  }
  throw new BillingError('Bills are only available in the resident app', 403)
}

const handle =
  (label: string, fn: (req: AuthenticatedRequest, res: Response) => Promise<void>) =>
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await fn(req, res)
    } catch (error) {
      if (error instanceof BillingError) {
        res.status(error.status).json({ success: false, message: error.message })
        return
      }
      logger.error({ error }, label)
      res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' })
    }
  }

async function ownInvoice(req: AuthenticatedRequest) {
  const unitId = await callerUnitId(req)
  const invoiceId = String(req.params.invoiceId || '')
  let invoice = await Invoice.findOne({
    where: { id: invoiceId, unitId, isDeleted: false },
    attributes: ['id', 'status'],
  })
  if (!invoice) {
    // A bill from a flat the household lived in before moving here.
    const residents = await Resident.findAll({ where: { unitId, ...BILLABLE_RESIDENT_WHERE }, attributes: ['id'] })
    const previous = await previousFlatInvoices(
      residents.map((r) => r.id),
      unitId,
    )
    invoice = previous.find((p) => p.id === invoiceId) ?? null
  }
  if (!invoice || invoice.status === InvoiceStatus.DRAFT) throw new BillingError('Bill not found', 404)
  return invoice
}

export const getMyInvoices = handle('Failed to list resident bills', async (req, res) => {
  const unitId = await callerUnitId(req)
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))
  // Also the bills of flats the household lived in before (shown with that flat's number).
  res.json({
    success: true,
    data: await getUnitInvoices(unitId, { page, limit }, { excludeDrafts: true, previousFlats: 'all' }),
  })
})

export const getMyInvoice = handle('Failed to fetch resident bill', async (req, res) => {
  const invoice = await ownInvoice(req)
  res.json({ success: true, data: await getInvoiceById(invoice.id) })
})

/** Invoice PDF, or a receipt PDF with ?type=RECEIPT&receiptId=. */
export const getMyInvoicePdf = handle('Failed to fetch resident bill PDF', async (req, res) => {
  const invoice = await ownInvoice(req)
  const isReceipt = String(req.query.type || '').toUpperCase() === InvoiceDocumentType.RECEIPT
  const pdfUrl = isReceipt
    ? await ensureReceiptPdf(String(req.query.receiptId || ''), null, invoice.id)
    : await ensureInvoicePdf(invoice.id, null)
  res.json({ success: true, data: { pdfUrl } })
})
