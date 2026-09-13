import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import {
  changePackage,
  getAllPackageSubscriptions,
  getPackageSubscriptionById,
  renewPackageSubscription,
  updateSubscriptionStatus,
} from '../controllers/packageSubscription.controller.js'

const router = Router({ mergeParams: true })

router.use(authenticate)

// Get all package subscriptions with calculations & filters
router.get('/', getAllPackageSubscriptions)

// Get subscription by ID
router.get('/:id', getPackageSubscriptionById)

// Change package for subscription
router.post('/:id/change-package', changePackage)

// Update subscription status (Stop / Resume)
router.put('/:id/status', updateSubscriptionStatus)

// Renew package subscription
router.post('/:id/renew', renewPackageSubscription)

export default router
