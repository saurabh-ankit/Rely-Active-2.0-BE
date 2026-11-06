import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import {
  createWalkin,
  scanQr,
  clockIn,
  clockOut,
  getPendingPreapproved,
  getEntriesByStatus,
  getPropertyUnits,
  rejectScan,
  scanItemRequestQr,
  approveItemRequestScan,
  declineItemRequestScan,
} from '../controllers/gns.controller.js'

const router = Router()

router.use(authenticate)

router.get('/property-units', getPropertyUnits)
router.get('/pending-preapproved', getPendingPreapproved)
router.get('/entries', getEntriesByStatus)
router.post('/walkin', createWalkin)
router.post('/scan', scanQr)
router.post('/reject-scan', rejectScan)
router.post('/clockin', clockIn)
router.post('/clockout', clockOut)

// Asset item-request QR decisions (gate security)
router.post('/item-request/scan', scanItemRequestQr)
router.post('/item-request/approve', approveItemRequestScan)
router.post('/item-request/decline', declineItemRequestScan)

export default router
