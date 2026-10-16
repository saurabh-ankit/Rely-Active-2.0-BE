import express from 'express'
import multer from 'multer'
import { authenticate } from '../../middlewares/authenticate.js'
import { resourceGuard } from '../../middlewares/authorizeResource.js'
import {
  createInvoice,
  createMiscItem,
  deleteMiscItem,
  downloadDocument,
  getInvoice,
  getInvoiceData,
  getInvoices,
  getMiscItems,
  getReceipts,
  getTaxSettings,
  getUnbilledServices,
  getUnits,
  recordPayment,
  updateInvoice,
  updateTaxSettings,
  uploadBillingAttachment,
} from '../controllers/billing.controller.js'

const router = express.Router({ mergeParams: true })
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
}).single('file')

router.use(authenticate)
router.use(
  resourceGuard(
    [
      { match: /^\/invoice\/[^/]+\/record-payment$/, keys: 'BILLING.RECEIPTS', action: 'create' },
      { match: '/receipts', keys: 'BILLING.RECEIPTS' },
      // Generating a missing PDF is part of viewing a document.
      { match: /^\/invoice\/[^/]+\/download\//, keys: ['BILLING.INVOICES', 'BILLING.RECEIPTS'], action: 'view' },
      { match: '/attachments', keys: ['BILLING.INVOICES', 'BILLING.RECEIPTS'], action: 'create' },
      { match: '/settings', keys: ['BILLING', 'SETTINGS'] },
    ],
    'BILLING.INVOICES',
  ),
)

// ── Flats directory ──────────────────────────────────────────────────────────
router.get('/units', getUnits)

// ── Invoices (ported from Rely Assist, keyed on the flat) ───────────────────
router.get('/invoice/:unitId', getInvoiceData)
router.get('/unbilled-services/:unitId', getUnbilledServices)
router.post('/invoice/:unitId', createInvoice)
router.patch('/invoice/:invoiceId', updateInvoice)
router.get('/invoices/:unitId', getInvoices)
router.get('/invoice-detail/:invoiceId', getInvoice)

// ── Payments & documents ─────────────────────────────────────────────────────
router.post('/invoice/:invoiceId/record-payment', recordPayment)
router.get('/receipts/:unitId', getReceipts)
router.get('/invoice/:invoiceId/download/:documentType', downloadDocument)
router.post('/attachments', attachmentUpload, uploadBillingAttachment)

// ── Miscellaneous charges logged against a flat ──────────────────────────────
router.get('/misc-items/:unitId', getMiscItems)
router.post('/misc-items', createMiscItem)
router.delete('/misc-items/:itemId', deleteMiscItem)

// ── Global GST / tax settings ────────────────────────────────────────────────
router.get('/settings/tax', getTaxSettings)
router.put('/settings/tax', updateTaxSettings)

export default router
