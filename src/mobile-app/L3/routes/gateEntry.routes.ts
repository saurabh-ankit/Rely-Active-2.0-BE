import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import { createWalkin, scanQr, clockIn, clockOut } from '../controllers/gateEntry.controller.js'

const router = Router()

router.use(authenticate)

router.post('/walkin', createWalkin)
router.post('/scan', scanQr)
router.post('/clockin', clockIn)
router.post('/clockout', clockOut)

export default router
