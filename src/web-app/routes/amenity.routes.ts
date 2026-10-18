import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'
import { validateBody, validateParams } from '../../middlewares/validate/index.js'
import {
  amenityIdParamSchema,
  createAmenitySchema,
  updateAmenitySchema,
  updateAmenityStatusSchema,
} from '../../validations/amenity.validation.js'
import {
  createAmenity,
  deleteAmenity,
  getAllAmenities,
  getAmenityById,
  updateAmenity,
  updateAmenityStatus,
} from '../controllers/amenity.controller.js'

const router = Router()

router.use(authenticate)

router.get('/', getAllAmenities)
router.post('/', authorize('USER_CREATE'), validateBody(createAmenitySchema), createAmenity)
router.get('/:id', validateParams(amenityIdParamSchema), getAmenityById)
router.put(
  '/:id',
  authorize('USER_UPDATE'),
  validateParams(amenityIdParamSchema),
  validateBody(updateAmenitySchema),
  updateAmenity,
)
router.patch(
  '/:id/status',
  authorize('USER_UPDATE'),
  validateParams(amenityIdParamSchema),
  validateBody(updateAmenityStatusSchema),
  updateAmenityStatus,
)
router.delete('/:id', authorize('USER_DELETE'), validateParams(amenityIdParamSchema), deleteAmenity)

export default router
