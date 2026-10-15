import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import { getMyInvoice, getMyInvoicePdf, getMyInvoices } from '../controllers/billingMobile.controller.js'

const billingMobileRouter = Router()

billingMobileRouter.use(authenticate)

/** GET /api/v1/mobile/l1/billing/invoices — the caller's flat's bills (resident or residing family member). */
billingMobileRouter.get('/invoices', getMyInvoices)
billingMobileRouter.get('/invoices/:invoiceId', getMyInvoice)
billingMobileRouter.get('/invoices/:invoiceId/pdf', getMyInvoicePdf)

export default billingMobileRouter
