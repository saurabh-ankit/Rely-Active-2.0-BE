import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import { validateBody } from '../../../middlewares/validate/index.js'
import { submitFeedbackSchema } from '../../../validations/feedback.validation.js'
import {
  getResidentAdvertisements,
  getResidentFeedbackForm,
  getResidentFeedbackForms,
  submitResidentFeedbackForm,
} from '../controllers/feedbackMobile.controller.js'

export const advertisementMobileRouter = Router()
advertisementMobileRouter.use(authenticate)
advertisementMobileRouter.get('/', getResidentAdvertisements)

const feedbackMobileRouter = Router()
feedbackMobileRouter.use(authenticate)
feedbackMobileRouter.get('/', getResidentFeedbackForms)
feedbackMobileRouter.get('/:id', getResidentFeedbackForm)
feedbackMobileRouter.post('/:id/submit', validateBody(submitFeedbackSchema), submitResidentFeedbackForm)

export default feedbackMobileRouter
