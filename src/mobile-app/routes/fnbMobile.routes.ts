import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { getResidentDailyMenu, getResidentOrdersHistory, placeMealOrder } from '../controllers/fnbMobile.controller.js'

const router = Router()

router.use(authenticate)

router.get('/menu', getResidentDailyMenu)
router.post('/order', placeMealOrder)
router.get('/orders', getResidentOrdersHistory)

export default router
