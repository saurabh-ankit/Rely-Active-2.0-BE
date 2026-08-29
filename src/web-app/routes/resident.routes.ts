import { Router } from 'express'
import {
  createResident,
  deleteResident,
  getAllResidents,
  getResidentsByUnit,
  updateResident,
} from '../controllers/resident.controller.js'
import { residentLogin } from '../controllers/residentAuth.controller.js'

const router = Router()

// Mobile App Resident Login Endpoint
router.post('/auth/login', residentLogin)

// Resident Onboarding & Operations
router.post('/', createResident)
router.get('/', getAllResidents)
router.get('/unit/:unitId', getResidentsByUnit)
router.put('/:id', updateResident)
router.delete('/:id', deleteResident)

export default router
