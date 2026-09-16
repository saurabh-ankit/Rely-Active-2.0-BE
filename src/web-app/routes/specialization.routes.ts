import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'
import { validateBody, validateParams } from '../../middlewares/validate/index.js'
import {
  createSpecializationSchema,
  setDoctorSpecializationsSchema,
  specializationIdParamSchema,
  updateSpecializationSchema,
  updateSpecializationStatusSchema,
} from '../../validations/specialization.validation.js'
import {
  createSpecialization,
  deleteSpecialization,
  getAllSpecializations,
  getDoctorSpecializations,
  getDoctorsBySpecialization,
  getSpecializationById,
  setDoctorSpecializations,
  updateSpecialization,
  updateSpecializationStatus,
} from '../controllers/specialization.controller.js'

const router = Router()

router.use(authenticate)

// Doctor assignments come before /:id so "doctors" is not read as an id.
router.get('/doctors/:userId', getDoctorSpecializations)
router.put(
  '/doctors/:userId',
  authorize('USER_UPDATE'),
  validateBody(setDoctorSpecializationsSchema),
  setDoctorSpecializations,
)

router.get('/', getAllSpecializations)
router.post('/', authorize('USER_CREATE'), validateBody(createSpecializationSchema), createSpecialization)
router.get('/:id', validateParams(specializationIdParamSchema), getSpecializationById)
router.get('/:id/doctors', validateParams(specializationIdParamSchema), getDoctorsBySpecialization)
router.put(
  '/:id',
  authorize('USER_UPDATE'),
  validateParams(specializationIdParamSchema),
  validateBody(updateSpecializationSchema),
  updateSpecialization,
)
router.patch(
  '/:id/status',
  authorize('USER_UPDATE'),
  validateParams(specializationIdParamSchema),
  validateBody(updateSpecializationStatusSchema),
  updateSpecializationStatus,
)
router.delete('/:id', authorize('USER_DELETE'), validateParams(specializationIdParamSchema), deleteSpecialization)

export default router
