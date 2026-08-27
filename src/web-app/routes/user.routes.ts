import { Router } from 'express'
import {
  assignUserPermission,
  assignUserRole,
  createUser,
  getAllUsers,
  getUserAccessibleProperties,
  getUserById,
  updateUserPermissions,
  updateUserProperties,
} from '../controllers/user.controller.js'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'

const router = Router()

router.use(authenticate)

router.get('/me/properties', getUserAccessibleProperties)
router.get('/', authorize('USER_VIEW'), getAllUsers)
router.get('/:id', authorize('USER_VIEW'), getUserById)
router.post('/', authorize('USER_CREATE'), createUser)
router.post('/:id/roles', authorize('USER_ASSIGN_ROLE'), assignUserRole)
router.post('/:id/permissions', authorize('USER_ASSIGN_PERMISSION'), assignUserPermission)
router.put('/:id/permissions', authorize('USER_ASSIGN_PERMISSION'), updateUserPermissions)
router.put('/:id/properties', authorize('USER_UPDATE'), updateUserProperties)

export default router
