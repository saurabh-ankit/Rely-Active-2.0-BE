import { Router } from 'express'
import {
  createResident,
  deleteResident,
  getAllResidents,
  getResidentBillingData,
  getResidentById,
  getResidentsByUnit,
  updateResident,
  getResidentCareTeam,
  assignCareTeamMember,
  removeCareTeamMember,
} from '../controllers/resident.controller.js'
import { upload } from '../../middlewares/upload.js'

const router = Router()

const uploadResidentPhoto = upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'avatar', maxCount: 1 },
  { name: 'image', maxCount: 1 },
])

// Resident Billing
router.get('/billing', getResidentBillingData)
router.get('/billing/:id', getResidentBillingData)
router.get('/:id/billing', getResidentBillingData)

// ── Care Team routes ───────────────────────────────────────────────────────
router.get('/:residentId/care-team', getResidentCareTeam)
router.post('/:residentId/care-team', assignCareTeamMember)
router.delete('/:residentId/care-team/:memberId', removeCareTeamMember)

// Resident Onboarding & Operations
router.post('/', uploadResidentPhoto, createResident)
router.get('/', getAllResidents)
router.get('/unit/:unitId', getResidentsByUnit)
router.get('/:id', getResidentById)
router.put('/:id', uploadResidentPhoto, updateResident)
router.delete('/:id', deleteResident)

export default router
