import express from 'express'
import multer from 'multer'
import { authenticate } from '../../middlewares/authenticate.js'
import {
  addBillingParty,
  cancelEvent,
  cancelSubscription,
  createBillingAccount,
  createSubscription,
  generateInvoice,
  getBillingAccountById,
  getBillingAccounts,
  getBillingRuns,
  getInvoiceById,
  getInvoices,
  getLedgerStatement,
  getPendingEvents,
  getSubscriptions,
  getTaxSettings,
  getUnitBilling360,
  getUnitsBillingSummary,
  ingestEvent,
  pauseSubscription,
  previewInvoice,
  resumeSubscription,
  triggerBatchRun,
  updateBillingAccount,
  updateBillingParty,
  updateTaxSettings,
  updateEvent,
  uploadEventAttachment,
} from '../controllers/billing.controller.js'

const router = express.Router()
const eventBillUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
}).single('file')

// Authenticate all billing routes
router.use(authenticate)

// ── 0. Flat-Centric Directory & Unit 360° Folio ─────────────────────────────
router.get('/units-summary', getUnitsBillingSummary)
router.get('/units/:unitId/360', getUnitBilling360)

// ── 1. Billing Accounts (Folios) ─────────────────────────────────────────────
router.post('/accounts', createBillingAccount)
router.get('/accounts', getBillingAccounts)
router.get('/accounts/:id', getBillingAccountById)
router.put('/accounts/:id', updateBillingAccount)
router.get('/accounts/:accountId/ledger', getLedgerStatement)

// ── 2. Billing Parties (Who Pays) ────────────────────────────────────────────
router.post('/parties', addBillingParty)
router.put('/parties/:partyId', updateBillingParty)

// ── 3. Subscriptions (Recurring Charges) ─────────────────────────────────────
router.post('/subscriptions', createSubscription)
router.get('/accounts/:accountId/subscriptions', getSubscriptions)
router.put('/subscriptions/:id/pause', pauseSubscription)
router.put('/subscriptions/:id/resume', resumeSubscription)
router.delete('/subscriptions/:id', cancelSubscription)

// ── 4. Usage Events (Consumption Facts) ──────────────────────────────────────
router.post('/events', ingestEvent)
router.put('/events/:eventId', updateEvent)
router.post('/events/:eventId/attachments', eventBillUpload, uploadEventAttachment)
router.get('/accounts/:accountId/events/pending', getPendingEvents)
router.put('/events/:eventId/cancel', cancelEvent)

// ── 5. Invoicing ─────────────────────────────────────────────────────────────
router.post('/invoices/preview', previewInvoice)
router.post('/invoices/generate', generateInvoice)
router.get('/invoices', getInvoices)
router.get('/invoices/:id', getInvoiceById)

// ── 6. Batch Billing Runs ───────────────────────────────────────────────────
router.post('/runs', triggerBatchRun)
router.get('/runs', getBillingRuns)

// ── 7. Global GST / Tax Settings ────────────────────────────────────────────
router.get('/settings/tax', getTaxSettings)
router.put('/settings/tax', updateTaxSettings)

export default router
