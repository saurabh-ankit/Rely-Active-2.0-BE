import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { upload } from '../../middlewares/upload.js'
import { validateBody } from '../../middlewares/validate/index.js'
import {
  createAdvertisementSchema,
  updateAdvertisementSchema,
  updateAdvertisementStatusSchema,
} from '../../validations/feedback.validation.js'
import {
  createAdvertisement,
  deleteAdvertisement,
  getAdvertisementById,
  getAdvertisements,
  updateAdvertisement,
  updateAdvertisementStatus,
} from '../controllers/advertisement.controller.js'

const advertisementRouter = Router({ mergeParams: true })

advertisementRouter.use(authenticate)
advertisementRouter.get('/', getAdvertisements)
advertisementRouter.post(
  '/',
  upload.fields([{ name: 'image', maxCount: 1 }]),
  validateBody(createAdvertisementSchema),
  createAdvertisement,
)
advertisementRouter.get('/:id', getAdvertisementById)
advertisementRouter.put(
  '/:id',
  upload.fields([{ name: 'image', maxCount: 1 }]),
  validateBody(updateAdvertisementSchema),
  updateAdvertisement,
)
advertisementRouter.patch('/:id/status', validateBody(updateAdvertisementStatusSchema), updateAdvertisementStatus)
advertisementRouter.delete('/:id', deleteAdvertisement)

export default advertisementRouter
