import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import { getNurseCareTasks, completeNurseCareTask } from '../controllers/medicalCareTasks.controller.js'

const router = Router()

// Require authentication for L3 medical staff endpoints
router.use(authenticate)

router.get('/care-tasks', getNurseCareTasks)
router.post('/care-tasks/complete', completeNurseCareTask)
router.post('/care-tasks/:id/complete', completeNurseCareTask)

export default router
