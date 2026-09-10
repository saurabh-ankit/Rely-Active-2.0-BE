import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import { upload } from '../../../middlewares/upload.js'
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
router.post(
  '/',
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'voice', maxCount: 1 },
    { name: 'voiceNote', maxCount: 1 },
    { name: 'photos', maxCount: 10 },
    { name: 'photo', maxCount: 10 },
    { name: 'media', maxCount: 10 },
    { name: 'files', maxCount: 10 },
  ]),
  createResidentTicket,
)
router.get('/:id', getResidentTicketById)
router.patch('/:id/tat', updateTicketTat)
router.patch('/:id/escalate', escalateTicket)

export default router
