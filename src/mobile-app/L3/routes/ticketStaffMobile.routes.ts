import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import { upload } from '../../../middlewares/upload.js'
import {
  completeTicket,
  getStaffTicketById,
  getStaffTickets,
  startWork,
} from '../controllers/ticketStaffMobile.controller.js'

const router = Router()

router.use(authenticate)

router.get('/', getStaffTickets)
router.get('/:id', getStaffTicketById)
router.post('/:id/start-work', startWork)
router.post(
  '/:id/complete',
  upload.fields([
    { name: 'invoice', maxCount: 1 },
    { name: 'photo', maxCount: 5 },
    { name: 'audio', maxCount: 1 },
    { name: 'voiceNote', maxCount: 1 },
  ]),
  completeTicket,
)

export default router
