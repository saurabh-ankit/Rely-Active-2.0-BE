import { Router } from 'express'
import { getMe, login } from '../controllers/auth.controller.js'
import { authenticate } from '../../middlewares/authenticate.js'

const router = Router()

router.post('/login', login)
router.get('/profile', authenticate, getMe)
router.get('/user-profile', authenticate, getMe)
router.get('/me', authenticate, getMe)

export default router
