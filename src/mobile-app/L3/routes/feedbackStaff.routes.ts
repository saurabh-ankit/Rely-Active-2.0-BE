import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import { validateBody } from '../../../middlewares/validate/index.js'
import { submitFeedbackSchema } from '../../../validations/feedback.validation.js'
import {
  getStaffAdvertisements,
  getStaffFeedbackForm,
  getStaffFeedbackForms,
  submitStaffFeedbackForm,
} from '../controllers/feedbackStaff.controller.js'

export const advertisementStaffRouter = Router()
advertisementStaffRouter.use(authenticate)
advertisementStaffRouter.get('/', getStaffAdvertisements)

const feedbackStaffRouter = Router()

feedbackStaffRouter.use(authenticate)
feedbackStaffRouter.get('/', getStaffFeedbackForms)
feedbackStaffRouter.get('/:id', getStaffFeedbackForm)
feedbackStaffRouter.post('/:id/submit', validateBody(submitFeedbackSchema), submitStaffFeedbackForm)

export default feedbackStaffRouter
