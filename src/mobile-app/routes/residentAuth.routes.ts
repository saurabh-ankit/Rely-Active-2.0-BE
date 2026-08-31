import { Router } from 'express'
import { getResidentProfile, residentLogin, updateResidentProfile } from '../controllers/residentAuth.controller.js'
import { upload } from '../../middlewares/upload.js'

const router = Router()

const uploadPhoto = upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'avatar', maxCount: 1 },
  { name: 'image', maxCount: 1 },
])

router.post('/login', residentLogin)
router.get('/profile', getResidentProfile)
router.put('/profile', uploadPhoto, updateResidentProfile)

export default router
