import { Router } from 'express'
import { getDashboardStats } from '../controllers/dashboard.controller.js'
import { getDashboardAnalytics } from '../controllers/dashboardAnalytics.controller.js'
import { getDashboardSettings, updateDashboardSettings } from '../controllers/dashboardSettings.controller.js'
import { authenticate } from '../../middlewares/authenticate.js'
import { validateBody } from '../../middlewares/validate/index.js'
import { updateDashboardSettingsSchema } from '../../validations/dashboard.validation.js'

const router = Router({ mergeParams: true })

// Every dashboard route needs a signed-in user.
router.use(authenticate)

router.get('/stats', getDashboardStats)
router.get('/analytics/:tab', getDashboardAnalytics)
// Visible tabs: one setting per company, applied to all of its properties.
router.get('/settings', getDashboardSettings)
router.put('/settings', validateBody(updateDashboardSettingsSchema), updateDashboardSettings)
router.get('/', getDashboardStats)

export default router
