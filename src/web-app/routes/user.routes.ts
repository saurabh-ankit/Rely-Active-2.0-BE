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
import { validateBody } from '../../middlewares/validate/index.js'
import { assignUserRoleSchema, createUserSchema, updateUserSchema } from '../../validations/user.validation.js'
import { upload } from '../../middlewares/upload.js'

const router = Router()

const uploadUserPhoto = upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'avatar', maxCount: 1 },
  { name: 'image', maxCount: 1 },
])

router.use(authenticate)

router.get('/accessible-properties', getUserAccessibleProperties)
router.get('/user-properties', getUserAccessibleProperties)
router.get('/me/properties', getUserAccessibleProperties)
router.get('/', authorize('USER_VIEW'), getAllUsers)
router.get('/:id', authorize('USER_VIEW'), getUserById)
router.post('/', authorize('USER_CREATE'), uploadUserPhoto, validateBody(createUserSchema), createUser)
router.put('/:id', authorize('USER_UPDATE'), uploadUserPhoto, validateBody(updateUserSchema), updateUser)
router.post('/:id/roles', authorize('USER_ASSIGN_ROLE'), validateBody(assignUserRoleSchema), assignUserRole)
router.put('/:id/properties', authorize('USER_UPDATE'), updateUserProperties)

export default router
