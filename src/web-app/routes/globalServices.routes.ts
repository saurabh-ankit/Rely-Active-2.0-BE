import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { upload } from '../../middlewares/upload.js'
import { validateBody } from '../../middlewares/validate/index.js'
import { createGlobalServiceSchema, updateGlobalServiceSchema } from '../../validations/globalService.validation.js'
import {
  createGlobalService,
  deleteGlobalService,
  getAllGlobalServices,
  updateGlobalService,
} from '../controllers/globalService/globalService.controller.js'

const router = Router()

router.use(authenticate)

router.get('/', getAllGlobalServices)
router.post('/', upload.single('image'), validateBody(createGlobalServiceSchema), createGlobalService)
router.put('/:id', upload.single('image'), validateBody(updateGlobalServiceSchema), updateGlobalService)
router.delete('/:id', deleteGlobalService)

export default router
