import express from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import {
  createMiscellaneousService,
  createPayment,
  generateInvoice,
  getInvoiceById,
  getInvoices,
  getMiscellaneousServices,
  getTaxSettings,
  getUnitBilling360,
  getUnitServices,
  getUnitsBillingSummary,
  updateTaxSettings,
} from '../controllers/billing.controller.js'

const router = express.Router()

// Authenticate all billing routes
router.use(authenticate)

// ── 1. Flat Directory Summary & Unit 360 Overview ────────────────────────────
router.get('/units-summary', getUnitsBillingSummary)
router.get('/units/:unitId/360', getUnitBilling360)
router.get('/units/:unitId/services', getUnitServices)

// ── 2. Invoicing (rely-assist architecture) ──────────────────────────────────
router.post('/invoices/generate', generateInvoice)
router.post('/invoices', generateInvoice)
router.get('/invoices', getInvoices)
router.get('/invoices/:id', getInvoiceById)

// ── 3. Payments & Receipts ───────────────────────────────────────────────────
router.post('/payments', createPayment)
router.post('/receipts', createPayment)

// ── 4. Miscellaneous Services (miscellaneous_at_services) ────────────────────
router.get('/miscellaneous-services', getMiscellaneousServices)
router.post('/miscellaneous-services', createMiscellaneousService)

// ── 5. Global Tax Settings ───────────────────────────────────────────────────
router.get('/settings/tax', getTaxSettings)
router.put('/settings/tax', updateTaxSettings)

export default router
