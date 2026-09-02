import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import {
  createResidentTicket,
  escalateTicket,
  getResidentTicketById,
  getResidentTickets,
  getResidentTicketDepartments,
  updateTicketTat,
} from '../controllers/ticketMobile.controller.js'

const router = Router()

router.use(authenticate)

router.get('/departments', getResidentTicketDepartments)
router.get('/', getResidentTickets)
router.post('/', createResidentTicket)
router.get('/:id', getResidentTicketById)
router.patch('/:id/tat', updateTicketTat)
router.patch('/:id/escalate', escalateTicket)

export default router
