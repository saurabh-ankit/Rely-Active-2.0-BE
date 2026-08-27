import { Router } from 'express'
import { getAllPermissions, getModules } from '../controllers/permission.controller.js'
import { authenticate } from '../../middlewares/authenticate.js'

const router = Router()

router.use(authenticate)
router.get('/', getAllPermissions)
router.get('/modules', getModules)

export default router
