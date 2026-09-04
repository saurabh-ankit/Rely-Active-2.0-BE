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

export default router
