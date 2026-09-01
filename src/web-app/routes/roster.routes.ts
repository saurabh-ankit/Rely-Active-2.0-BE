import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import {
  onboardDoctor,
  addDoctorLocationScope,
  createDoctorEngagement,
  getDoctorsForLocation,
} from '../controllers/rosters/doctor.controller.js'
import { createShiftTemplate, getShiftTemplates } from '../controllers/rosters/shift.controller.js'
import { createFrequencyTemplate, getFrequencyTemplates } from '../controllers/rosters/frequency.controller.js'
import {
  validateAssignment,
  createAssignment,
  getAssignments,
  publishAssignment,
  copyAssignment,
} from '../controllers/rosters/assignment.controller.js'
import { getRosterDates, requestShiftReplacement, cancelRosterDate } from '../controllers/rosters/dateInstance.controller.js'
import {
  getSpecializations,
  createSpecialization,
  deleteSpecialization,
} from '../controllers/rosters/medicalSpecialization.controller.js'

const router = Router()

// All roster management endpoints require authentication
router.use(authenticate)

// ── Medical Specializations Master ──────────────────────────────────────────
router.get('/specializations', getSpecializations)
router.post('/specializations', createSpecialization)
router.delete('/specializations/:id', deleteSpecialization)


// ── Doctor Onboarding & Scoping ──────────────────────────────────────────────
router.post('/companies/:companyId/locations/:locationId/doctors/onboard', onboardDoctor)
router.get('/companies/:companyId/locations/:locationId/doctors', getDoctorsForLocation)
router.post('/doctors/:doctorProfileId/locations', addDoctorLocationScope)
router.post('/doctors/:doctorProfileId/engagements', createDoctorEngagement)

// ── Shift Master Templates ───────────────────────────────────────────────────
router.post('/companies/:companyId/locations/:locationId/shifts', createShiftTemplate)
router.get('/companies/:companyId/locations/:locationId/shifts', getShiftTemplates)

// ── Frequency Templates ──────────────────────────────────────────────────────
router.post('/companies/:companyId/locations/:locationId/frequencies', createFrequencyTemplate)
router.get('/companies/:companyId/locations/:locationId/frequencies', getFrequencyTemplates)

// ── Roster Assignments ───────────────────────────────────────────────────────
router.post('/companies/:companyId/locations/:locationId/assignments/validate', validateAssignment)
router.post('/companies/:companyId/locations/:locationId/assignments', createAssignment)
router.get('/companies/:companyId/locations/:locationId/assignments', getAssignments)
router.post('/companies/:companyId/locations/:locationId/assignments/:assignmentId/publish', publishAssignment)
router.post('/companies/:companyId/locations/:locationId/assignments/:assignmentId/copy-forward', copyAssignment)

// ── Roster Date Instance Engine & Calendar Grid ──────────────────────────────
router.get('/companies/:companyId/locations/:locationId/roster-dates', getRosterDates)
router.post('/companies/:companyId/locations/:locationId/roster-dates/:dateId/replace', requestShiftReplacement)
router.delete('/companies/:companyId/locations/:locationId/roster-dates/:dateId', cancelRosterDate)

export default router
