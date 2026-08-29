import { Router } from 'express'
import { createRole, getAllRoles } from '../controllers/role.controller.js'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'
import { validateBody } from '../../middlewares/validate/index.js'
import { createRoleSchema } from '../../validations/role.validation.js'

const router = Router()

router.use(authenticate)

router.get('/', authorize('USER_VIEW'), getAllRoles)
router.post('/', authorize('USER_ASSIGN_ROLE'), validateBody(createRoleSchema), createRole)

export default router
