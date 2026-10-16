import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import { getMyMedicalHistory, getMyMedicalHistoryByDate } from '../controllers/medicalHistoryMobile.controller.js'

const medicalHistoryMobileRouter = Router()
medicalHistoryMobileRouter.use(authenticate)

medicalHistoryMobileRouter.get('/', getMyMedicalHistory)
medicalHistoryMobileRouter.get('/diagnoses', getMyMedicalHistoryByDate)

export default medicalHistoryMobileRouter
