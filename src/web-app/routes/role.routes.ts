import { Router } from 'express'
import { createRole, getAllRoles, updateRolePermissions } from '../controllers/role.controller.js'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'

const router = Router()

router.use(authenticate)

router.get('/', authorize('USER_VIEW'), getAllRoles)
router.post('/', authorize('USER_ASSIGN_ROLE'), createRole)
router.put('/:id/permissions', authorize('USER_ASSIGN_PERMISSION'), updateRolePermissions)

export default router
