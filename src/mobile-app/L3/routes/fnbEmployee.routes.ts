import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import {
  getAssignedDeliveries,
  updateDeliveryStatus,
  completeDeliveryWithProof,
} from '../controllers/fnbEmployee.controller.js'

const router = Router()

// Require authentication for employee mobile app endpoints
router.use(authenticate)

router.get('/assigned-deliveries', getAssignedDeliveries)
router.patch('/delivery/:id/status', updateDeliveryStatus)
router.post('/delivery/:id/complete', completeDeliveryWithProof)

export default router
