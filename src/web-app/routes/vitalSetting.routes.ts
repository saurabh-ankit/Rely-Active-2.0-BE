import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'
import { upload } from '../../middlewares/upload.js'
import { validateBody, validateParams } from '../../middlewares/validate/index.js'
import {
  createVitalSettingSchema,
  updateVitalSettingSchema,
  vitalSettingIdParamSchema,
} from '../../validations/vitalSetting.validation.js'
import {
  createVitalSetting,
  deleteVitalSetting,
  getAllVitalSettings,
  getVitalSettingById,
  updateVitalSetting,
} from '../controllers/vitalSetting.controller.js'

const uploadVitalImage = upload.fields([
  { name: 'vitalImage', maxCount: 1 },
  { name: 'image', maxCount: 1 },
  { name: 'file', maxCount: 1 },
])

const router = Router()

router.use(authenticate)

router.get('/', getAllVitalSettings)
router.post('/', authorize('USER_CREATE'), uploadVitalImage, validateBody(createVitalSettingSchema), createVitalSetting)
router.get('/:id', validateParams(vitalSettingIdParamSchema), getVitalSettingById)
router.put(
  '/:id',
  authorize('USER_UPDATE'),
  validateParams(vitalSettingIdParamSchema),
  uploadVitalImage,
  validateBody(updateVitalSettingSchema),
  updateVitalSetting,
)
router.delete('/:id', authorize('USER_DELETE'), validateParams(vitalSettingIdParamSchema), deleteVitalSetting)

export default router
