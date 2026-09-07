import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import { getResidentEventById, getResidentEvents, reserveEventSeats } from '../controllers/eventMobile.controller.js'

const router = Router()

router.use(authenticate)

router.get('/', getResidentEvents)
router.get('/:id', getResidentEventById)
router.post('/:id/reserve', reserveEventSeats)

export default router
