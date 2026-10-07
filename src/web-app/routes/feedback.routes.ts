import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { validateBody } from '../../middlewares/validate/index.js'
import { saveFeedbackFormSchema, sendFeedbackFormSchema } from '../../validations/feedback.validation.js'
import {
  createFeedbackForm,
  deleteFeedbackForm,
  getFeedbackFormById,
  getFeedbackFormResponses,
  getFeedbackForms,
  getFeedbackRecipientCount,
  sendFeedbackForm,
  updateFeedbackForm,
} from '../controllers/feedback.controller.js'

const feedbackFormRouter = Router({ mergeParams: true })

feedbackFormRouter.use(authenticate)
feedbackFormRouter.get('/', getFeedbackForms)
feedbackFormRouter.post('/', validateBody(saveFeedbackFormSchema), createFeedbackForm)
feedbackFormRouter.get('/recipient-count', getFeedbackRecipientCount)
feedbackFormRouter.get('/:id', getFeedbackFormById)
feedbackFormRouter.put('/:id', validateBody(saveFeedbackFormSchema), updateFeedbackForm)
feedbackFormRouter.delete('/:id', deleteFeedbackForm)
feedbackFormRouter.post('/:id/send', validateBody(sendFeedbackFormSchema), sendFeedbackForm)
feedbackFormRouter.get('/:id/responses', getFeedbackFormResponses)

export default feedbackFormRouter
