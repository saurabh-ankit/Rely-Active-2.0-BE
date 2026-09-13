import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import {
  getNurseCareTasks,
  completeNurseCareTask,
  getDoctorResidents,
  getDoctorResidentDetails,
  getDoctorResidentCareTasks,
  getAvailableCareTasks,
  assignDoctorCareTask,
  deleteDoctorCareTask,
} from '../controllers/medical.controller.js'

const router = Router()

// Require authentication for L3 medical staff endpoints
router.use(authenticate)

// ── Nurse Endpoints ──────────────────────────────────────────────────────────
router.get('/care-tasks', getNurseCareTasks)
router.post('/care-tasks/:id/complete', completeNurseCareTask)

// ── Doctor Care Tasks & Templates Endpoints ─────────────────────────────────
router.get('/care-tasks/templates', getAvailableCareTasks)
router.post('/care-tasks/assign', assignDoctorCareTask)
router.get('/care-task/assignments', getDoctorResidentCareTasks)
router.delete('/care-task/assignments/:id', deleteDoctorCareTask)
router.delete('/care-tasks/:id', deleteDoctorCareTask)

// ── Doctor Resident Endpoints ────────────────────────────────────────────────
router.get('/doctor/residents', getDoctorResidents)
router.get('/doctor/residents/:id', getDoctorResidentDetails)

export default router
