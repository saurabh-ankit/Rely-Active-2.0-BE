import { Router } from 'express'
import { createRole, getAllRoles } from '../controllers/role.controller.js'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'

const router = Router()

router.use(authenticate)

router.get('/', authorize('USER_VIEW'), getAllRoles)
router.post('/', authorize('USER_ASSIGN_ROLE'), createRole)

export default router
