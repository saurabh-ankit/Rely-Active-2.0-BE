import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import { handleWorkDetailsUpload } from '../../../middlewares/workDetailsUpload.js'
import { validateBody, validateParams } from '../../../middlewares/validate/index.js'
import {
  acceptTicketOfferSchema,
  addTicketWorkDetailsSchema,
  rejectTicketOfferSchema,
  completeTicketSchema,
  staffTicketIdParamSchema,
  updateTicketTatSchema,
} from '../../../validations/ticketStaff.validation.js'
import {
  acceptTicketOffer,
  addTicketWorkDetails,
  getMyTicketOffers,
  rejectTicketOffer,
  completeTicket,
  getStaffTicketById,
  getStaffTickets,
  getTicketTatHistory,
  startWork,
  updateTicketTat,
} from '../controllers/ticketStaffMobile.controller.js'

const router = Router()

const validateTicketId = validateParams(staffTicketIdParamSchema)

router.use(authenticate)

router.get('/', getStaffTickets)
// Auto-assign offers (before `/:id`)
router.get('/offers', getMyTicketOffers)
router.post('/:id/offer/accept', validateTicketId, validateBody(acceptTicketOfferSchema), acceptTicketOffer)
router.post('/:id/offer/reject', validateTicketId, validateBody(rejectTicketOfferSchema), rejectTicketOffer)
router.get('/:id', validateTicketId, getStaffTicketById)
router.post('/:id/start-work', validateTicketId, startWork)
router.patch('/:id/tat', validateTicketId, validateBody(updateTicketTatSchema), updateTicketTat)
router.get('/:id/tat-history', validateTicketId, getTicketTatHistory)
router.post(
  '/:id/work-details',
  validateTicketId,
  handleWorkDetailsUpload,
  validateBody(addTicketWorkDetailsSchema),
  addTicketWorkDetails,
)
router.post(
  '/:id/complete',
  validateTicketId,
  handleWorkDetailsUpload,
  validateBody(completeTicketSchema),
  completeTicket,
)

export default router
