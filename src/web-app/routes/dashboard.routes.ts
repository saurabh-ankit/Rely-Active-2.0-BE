import { Router } from 'express'
import { getDashboardStats } from '../controllers/dashboard.controller.js'

const router = Router({ mergeParams: true })

router.get('/stats', getDashboardStats)
router.get('/', getDashboardStats)

export default router
