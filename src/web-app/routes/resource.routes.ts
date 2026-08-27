import { Router } from 'express'
import {
  getAllResources,
  getUserLocationPermissions,
  saveUserLocationPermissions,
} from '../controllers/resource.controller.js'
import { authenticate } from '../../middlewares/authenticate.js'

const router = Router()

router.use(authenticate)

router.get('/', getAllResources)
router.get('/users/:id/location-permissions', getUserLocationPermissions)
router.post('/users/:id/location-permissions', saveUserLocationPermissions)

export default router
