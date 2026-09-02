import { Router } from 'express'
import { getStaffProfile, staffLogin } from '../controllers/staffAuth.controller.js'

const router = Router()

router.post('/login', staffLogin)
router.get('/profile', getStaffProfile)

export default router
