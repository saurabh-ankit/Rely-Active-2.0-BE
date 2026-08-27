import { Router } from 'express'
import { getAllDepartments } from '../controllers/department.controller.js'
import { authenticate } from '../../middlewares/authenticate.js'

const router = Router()

router.use(authenticate)
router.get('/', getAllDepartments)

export default router
