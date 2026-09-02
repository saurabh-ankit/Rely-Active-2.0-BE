import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { getLocationGlobalServices } from '../controllers/globalService/globalService.controller.js'

const router = Router({ mergeParams: true })

router.use(authenticate)

router.get('/', getLocationGlobalServices)

export default router
