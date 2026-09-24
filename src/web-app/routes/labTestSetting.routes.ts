import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'
import { upload } from '../../middlewares/upload.js'
import { validateBody, validateParams } from '../../middlewares/validate/index.js'
import {
  createLabTestSettingSchema,
  updateLabTestSettingSchema,
  labTestSettingIdParamSchema,
} from '../../validations/labTestSetting.validation.js'
import {
  createLabTestSetting,
  deleteLabTestSetting,
  getAllLabTestSettings,
  getLabTestSettingById,
  updateLabTestSetting,
} from '../controllers/labTestSetting.controller.js'

const uploadLabTestIcon = upload.fields([
  { name: 'icon', maxCount: 1 },
  { name: 'image', maxCount: 1 },
  { name: 'file', maxCount: 1 },
])

const router = Router()

router.use(authenticate)

router.get('/', getAllLabTestSettings)
router.post(
  '/',
  authorize('USER_CREATE'),
  uploadLabTestIcon,
  validateBody(createLabTestSettingSchema),
  createLabTestSetting,
)
router.get('/:id', validateParams(labTestSettingIdParamSchema), getLabTestSettingById)
router.put(
  '/:id',
  authorize('USER_UPDATE'),
  validateParams(labTestSettingIdParamSchema),
  uploadLabTestIcon,
  validateBody(updateLabTestSettingSchema),
  updateLabTestSetting,
)
router.delete('/:id', authorize('USER_DELETE'), validateParams(labTestSettingIdParamSchema), deleteLabTestSetting)

export default router
