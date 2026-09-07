import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import {
  checkResidentVenueAvailability,
  getResidentVenueById,
  getResidentVenues,
} from '../controllers/eventVenueMobile.controller.js'

const router = Router()

router.use(authenticate)

router.get('/', getResidentVenues)
router.get('/availability', checkResidentVenueAvailability)
router.get('/:id', getResidentVenueById)

export default router
