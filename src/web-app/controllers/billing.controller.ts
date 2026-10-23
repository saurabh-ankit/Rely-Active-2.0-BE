import type { Response } from 'express'
import type { ZodType } from 'zod'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { resolveLocationId } from '../../middlewares/authorizeResource.js'
import { uploadFileToS3 } from '../../middlewares/s3/index.js'
import { logger } from '../../config/logger.js'
import { Company, CompanyCustomField, Invoice, UnitMiscellaneousItem, ServicesInvoice } from '../../models/index.js'
import { BillingError, loadUnitContext } from '../../services/billing/context.js'
import { todayDay } from '../../utils/billing/dates.js'
import { buildInvoicePreview, getUnbilledUsage } from '../../services/billing/invoiceBuilder.service.js'
import {
  createInvoice as createInvoiceService,
  recordPayment as recordPaymentService,
  updateInvoice as updateInvoiceService,
} from '../../services/billing/invoice.service.js'
import {
  getBillingUnits,
  getInvoiceById,
  getUnitInvoices,
  getUnitReceipts,
  listMiscellaneousItems,
} from '../../services/billing/billingQuery.service.js'
import { ensureInvoicePdf, ensureReceiptPdf } from '../../services/billing/billingPdf.service.js'
import { getTaxConfig } from '../../services/billing/tax.service.js'
import { InvoiceDocumentType, VOID_INVOICE_STATUSES } from '../../enums/billing.enum.js'
import {
  createMiscItemSchema,
  invoicePreviewQuerySchema,
  pageQuerySchema,
  recordPaymentSchema,
  saveInvoiceSchema,
  taxSettingsSchema,
  unbilledQuerySchema,
  unitsQuerySchema,
} from '../../validations/billing.validation.js'
import { Op } from 'sequelize'

type Handler = (req: AuthenticatedRequest, res: Response) => Promise<void>

/** Shared error handling: BillingError carries its HTTP status; anything else is a 500. */
const handle =
  (label: string, fn: Handler): Handler =>
  async (req, res) => {
    try {
      await fn(req, res)
    } catch (error) {
      if (error instanceof BillingError) {
        res.status(error.status).json({ success: false, message: error.message })
        return
      }
      logger.error({ error }, label)
      res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Internal error' })
    }
  }

const parse = <T>(schema: ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value)
  if (!result.success) {
    const first = result.error.issues[0]
    throw new BillingError(first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid request')
  }
  return result.data
}

const param = (req: AuthenticatedRequest, name: string): string => {
  const value = req.params[name]
  if (!value) throw new BillingError(`${name} is required`)
  return String(value)
}

/** Permissions are granted per property, so a flat must belong to the property the request acts on. */
async function assertUnitAccess(req: AuthenticatedRequest, unitId: string) {
  const ctx = await loadUnitContext(unitId)
  const locationId = resolveLocationId(req)
  if (locationId && locationId !== ctx.propertyId) throw new BillingError('Flat not found', 404)
  return ctx
}

const propertyScope = (req: AuthenticatedRequest) => resolveLocationId(req)

// ── Flats directory ──────────────────────────────────────────────────────────

export const getUnits = handle('Failed to list billing flats', async (req, res) => {
  const propertyId = propertyScope(req)
  if (!propertyId) throw new BillingError('Select a property')
  const { page, limit, search, month, status } = parse(unitsQuerySchema, req.query)
  const data = await getBillingUnits(propertyId, search, month ?? todayDay().slice(0, 7), status, { page, limit })
  res.json({ success: true, data })
})

// ── Invoice preview / create / edit / delete ────────────────────────────────

export const getInvoiceData = handle('Failed to build invoice preview', async (req, res) => {
  const unitId = param(req, 'unitId')
  await assertUnitAccess(req, unitId)
  const { editingInvoiceId, ...query } = parse(invoicePreviewQuerySchema, req.query)
  if (editingInvoiceId) {
    const editing = await Invoice.count({ where: { id: editingInvoiceId, unitId, isDeleted: false } })
    if (!editing) throw new BillingError('Invoice not found', 404)
  }
  const preview = await buildInvoicePreview({ unitId, ...query, excludeInvoiceId: editingInvoiceId })
  res.json({ success: true, message: 'Invoice data fetched', data: { invoice: preview } })
})

export const getUnbilledServices = handle('Failed to fetch unbilled services', async (req, res) => {
  const unitId = param(req, 'unitId')
  await assertUnitAccess(req, unitId)
  const { startDate, endDate } = parse(unbilledQuerySchema, req.query)
  const services = await getUnbilledUsage(unitId, startDate, endDate)
  res.json({ success: true, data: { services, total: services.reduce((sum, s) => sum + s.total, 0) } })
})

export const createInvoice = handle('Failed to create invoice', async (req, res) => {
  const unitId = param(req, 'unitId')
  await assertUnitAccess(req, unitId)
  const input = parse(saveInvoiceSchema, req.body)
  const invoice = await createInvoiceService(unitId, input, req.user?.id ?? null)
  const pdfUrl = await ensureInvoicePdf(invoice.id, req.user?.id ?? null).catch((error) => {
    logger.error({ error, invoiceId: invoice.id }, 'Invoice PDF generation failed')
    return null
  })
  res.status(201).json({
    success: true,
    message: 'Invoice created',
    data: { ...(await getInvoiceById(invoice.id)), pdfUrl },
  })
})

export const updateInvoice = handle('Failed to update invoice', async (req, res) => {
  const input = parse(saveInvoiceSchema, req.body)
  const invoice = await updateInvoiceService(param(req, 'invoiceId'), propertyScope(req), input, req.user?.id ?? null)
  const pdfUrl = await ensureInvoicePdf(invoice.id, req.user?.id ?? null).catch((error) => {
    logger.error({ error, invoiceId: invoice.id }, 'Invoice PDF generation failed')
    return null
  })
  res.json({ success: true, message: 'Invoice updated', data: { ...(await getInvoiceById(invoice.id)), pdfUrl } })
})

// ── Lists ────────────────────────────────────────────────────────────────────

export const getInvoices = handle('Failed to list invoices', async (req, res) => {
  const unitId = param(req, 'unitId')
  await assertUnitAccess(req, unitId)
  const { page, limit } = parse(pageQuerySchema, req.query)
  // Invoices of flats the residents moved here from (paid ones too, to follow what was carried
  // where): the unpaid ones are collected here.
  res.json({
    success: true,
    data: await getUnitInvoices(unitId, { page, limit }, { previousFlats: 'all' }),
  })
})

export const getInvoice = handle('Failed to fetch invoice', async (req, res) => {
  const invoice = await getInvoiceById(param(req, 'invoiceId'))
  const locationId = propertyScope(req)
  if (locationId && invoice.propertyId !== locationId) throw new BillingError('Invoice not found', 404)
  res.json({ success: true, data: invoice })
})

export const getReceipts = handle('Failed to list receipts', async (req, res) => {
  const unitId = param(req, 'unitId')
  await assertUnitAccess(req, unitId)
  const { page, limit } = parse(pageQuerySchema, req.query)
  res.json({ success: true, data: await getUnitReceipts(unitId, { page, limit }) })
})

// ── Payments & documents ─────────────────────────────────────────────────────

export const recordPayment = handle('Failed to record payment', async (req, res) => {
  const input = parse(recordPaymentSchema, req.body)
  const { invoice, receipt } = await recordPaymentService(
    param(req, 'invoiceId'),
    propertyScope(req),
    input,
    req.user?.id ?? null,
  )
  const receiptPdfUrl = await ensureReceiptPdf(receipt.id, req.user?.id ?? null).catch((error) => {
    logger.error({ error, receiptId: receipt.id }, 'Receipt PDF generation failed')
    return null
  })
  res.json({
    success: true,
    message: 'Payment recorded',
    data: {
      invoice: await getInvoiceById(invoice.id),
      receiptId: receipt.id,
      receiptNumber: receipt.receiptNumber,
      receiptPdfUrl,
    },
  })
})

/** Returns (generating if needed) the invoice PDF, or a receipt PDF when ?receiptId= is given. */
export const downloadDocument = handle('Failed to fetch billing document', async (req, res) => {
  const invoiceId = param(req, 'invoiceId')
  const invoice = await Invoice.findOne({
    where: { id: invoiceId, isDeleted: false },
    attributes: ['id', 'propertyId'],
  })
  const locationId = propertyScope(req)
  if (!invoice || (locationId && invoice.propertyId !== locationId)) throw new BillingError('Invoice not found', 404)
  const userId = req.user?.id ?? null
  const type = String(req.params.documentType || '').toUpperCase()
  const url =
    type === InvoiceDocumentType.RECEIPT
      ? await ensureReceiptPdf(String(req.query.receiptId || ''), userId, invoiceId)
      : await ensureInvoicePdf(invoiceId, userId)
  res.json({ success: true, data: { pdfUrl: url } })
})

export const uploadBillingAttachment = handle('Failed to upload billing attachment', async (req, res) => {
  const file = (req as AuthenticatedRequest & { file?: Express.Multer.File }).file
  if (!file) throw new BillingError('No file uploaded')
  const result = await uploadFileToS3(file, 'billing')
  res.json({ success: true, data: { url: result.location } })
})

// ── Miscellaneous charges logged against a flat ──────────────────────────────

export const getMiscItems = handle('Failed to list miscellaneous charges', async (req, res) => {
  const unitId = param(req, 'unitId')
  await assertUnitAccess(req, unitId)
  res.json({ success: true, data: await listMiscellaneousItems(unitId) })
})

export const createMiscItem = handle('Failed to add miscellaneous charge', async (req, res) => {
  const input = parse(createMiscItemSchema, req.body)
  const ctx = await assertUnitAccess(req, input.unitId)
  if (input.residentId && !ctx.residentIds.includes(input.residentId)) {
    throw new BillingError('That resident does not live in this flat')
  }
  const item = await UnitMiscellaneousItem.create({
    unitId: input.unitId,
    residentId: input.residentId ?? null,
    name: input.name,
    description: input.description ?? null,
    quantity: input.quantity,
    price: input.price,
    serviceDate: input.serviceDate,
    attachmentUrl: input.attachmentUrl ?? null,
    propertyId: ctx.propertyId,
    total: Math.round(input.quantity * input.price * 100) / 100,
    createdBy: req.user?.id ?? null,
  })
  res.status(201).json({ success: true, message: 'Charge added', data: item })
})

export const deleteMiscItem = handle('Failed to delete miscellaneous charge', async (req, res) => {
  const item = await UnitMiscellaneousItem.findOne({ where: { id: param(req, 'itemId'), isDeleted: false } })
  if (!item) throw new BillingError('Charge not found', 404)
  await assertUnitAccess(req, item.unitId)
  const billed = await ServicesInvoice.count({
    where: { sourceId: item.id, isDeleted: false },
    include: [
      {
        model: Invoice,
        as: 'invoice',
        required: true,
        where: { isDeleted: false, status: { [Op.notIn]: [...VOID_INVOICE_STATUSES] } },
      },
    ],
  })
  if (billed) throw new BillingError('This charge is already on an invoice')
  await item.update({ isDeleted: true, updatedBy: req.user?.id ?? null })
  res.json({ success: true, message: 'Charge removed' })
})

// ── Global GST / tax settings ────────────────────────────────────────────────

export const getTaxSettings = handle('Failed to get tax settings', async (_req, res) => {
  const config = await getTaxConfig()
  res.json({
    success: true,
    data: {
      gstEnabled: config.gstEnabled,
      defaultTaxRate: config.rate,
      defaultGstRate: config.rate,
      cgstRate: config.cgstStored,
      sgstRate: config.sgstStored,
      igstRate: config.cgstStored + config.sgstStored,
      companyGstNumber: config.gstNumber,
    },
  })
})

export const updateTaxSettings = handle('Failed to update tax settings', async (req, res) => {
  const { gstEnabled, defaultTaxRate, cgstRate, sgstRate, companyGstNumber } = parse(taxSettingsSchema, req.body)
  const company = await Company.findOne({ where: { isDeleted: false } })
  if (!company) throw new BillingError('No active company profile found', 404)

  if (companyGstNumber !== undefined && companyGstNumber !== null) {
    company.company_gst_number = companyGstNumber
    await company.save()
  }
  const fields = [
    { fieldName: 'gst_enabled', fieldLabel: 'GST Enabled', fieldValue: String(gstEnabled) },
    { fieldName: 'gst_rate', fieldLabel: 'Default GST Rate (%)', fieldValue: String(defaultTaxRate) },
    { fieldName: 'cgst_rate', fieldLabel: 'CGST Rate (%)', fieldValue: String(cgstRate) },
    { fieldName: 'sgst_rate', fieldLabel: 'SGST Rate (%)', fieldValue: String(sgstRate) },
    { fieldName: 'igst_rate', fieldLabel: 'IGST Rate (%)', fieldValue: String(cgstRate + sgstRate) },
  ]
  for (const f of fields) {
    const existing = await CompanyCustomField.findOne({
      where: { companyId: company.id, fieldName: f.fieldName, isDeleted: false },
    })
    if (existing) {
      existing.fieldValue = f.fieldValue
      await existing.save()
    } else {
      await CompanyCustomField.create({
        companyId: company.id,
        ...f,
        fieldType: 'number',
        isActive: true,
        isDeleted: false,
        createdBy: req.user?.id || null,
        updatedBy: req.user?.id || null,
      })
    }
  }
  res.json({
    success: true,
    message: 'Global GST tax settings updated successfully',
    data: {
      gstEnabled,
      defaultTaxRate,
      defaultGstRate: defaultTaxRate,
      cgstRate,
      sgstRate,
      igstRate: cgstRate + sgstRate,
      companyGstNumber: company.company_gst_number || '',
    },
  })
})
