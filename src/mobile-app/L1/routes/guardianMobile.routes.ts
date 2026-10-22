import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import { upload } from '../../../middlewares/upload.js'
import {
  getAttendanceHistory,
  getContactManager,
  getDocuments,
  getGuardianMe,
  uploadDocument,
} from '../controllers/guardianMobile.controller.js'

/** Guardian (and resident) helpers: /api/v1/mobile/l1/guardian */
const guardianMobileRouter = Router()

guardianMobileRouter.use(authenticate)

guardianMobileRouter.get('/me', getGuardianMe)
guardianMobileRouter.get('/contact-manager', getContactManager)
guardianMobileRouter.get('/attendance', getAttendanceHistory)
guardianMobileRouter.get('/documents', getDocuments)
guardianMobileRouter.post('/documents', upload.fields([{ name: 'file', maxCount: 1 }]), uploadDocument)

export default guardianMobileRouter
