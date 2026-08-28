import { Router } from 'express'
import {
  assignUserRole,
  createUser,
  getAllUsers,
  getUserAccessibleProperties,
  getUserById,
  updateUser,
  updateUserProperties,
} from '../controllers/user.controller.js'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'

const router = Router()

router.use(authenticate)

router.get('/accessible-properties', getUserAccessibleProperties)
router.get('/user-properties', getUserAccessibleProperties)
router.get('/me/properties', getUserAccessibleProperties)
router.get('/', authorize('USER_VIEW'), getAllUsers)
router.get('/:id', authorize('USER_VIEW'), getUserById)
router.post('/', authorize('USER_CREATE'), createUser)
router.put('/:id', authorize('USER_UPDATE'), updateUser)
router.post('/:id/roles', authorize('USER_ASSIGN_ROLE'), assignUserRole)
router.put('/:id/properties', authorize('USER_UPDATE'), updateUserProperties)

export default router
