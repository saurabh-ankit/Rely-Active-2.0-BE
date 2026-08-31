import { Router } from 'express'
import {
  createResident,
  deleteResident,
  getAllResidents,
  getResidentById,
  getResidentsByUnit,
  updateResident,
} from '../controllers/resident.controller.js'
import { upload } from '../../middlewares/upload.js'

const router = Router()

const uploadResidentPhoto = upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'avatar', maxCount: 1 },
  { name: 'image', maxCount: 1 },
])

// Resident Onboarding & Operations
router.post('/', uploadResidentPhoto, createResident)
router.get('/', getAllResidents)
router.get('/unit/:unitId', getResidentsByUnit)
router.get('/:id', getResidentById)
router.put('/:id', uploadResidentPhoto, updateResident)
router.delete('/:id', deleteResident)

export default router
