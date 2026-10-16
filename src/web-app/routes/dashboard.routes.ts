import { Router } from 'express'
import { getDashboardStats } from '../controllers/dashboard.controller.js'
import { authenticate } from '../../middlewares/authenticate.js'

const router = Router({ mergeParams: true })

// Every dashboard route needs a signed-in user.
router.use(authenticate)

router.get('/stats', getDashboardStats)
router.get('/', getDashboardStats)

export default router
