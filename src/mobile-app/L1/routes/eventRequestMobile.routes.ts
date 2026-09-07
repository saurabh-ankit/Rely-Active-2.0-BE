import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import {
  createEventRequest,
  getMyEventRequestById,
  listMyEventRequests,
} from '../controllers/eventVenueMobile.controller.js'

const router = Router()

router.use(authenticate)

router.get('/', listMyEventRequests)
router.get('/:id', getMyEventRequestById)
router.post('/', createEventRequest)

export default router
