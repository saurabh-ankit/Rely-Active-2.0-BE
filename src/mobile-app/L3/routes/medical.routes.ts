import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import { upload } from '../../../middlewares/upload.js'
import { validateBody, validateParams } from '../../../middlewares/validate/index.js'
import {
  createResidentLabReportSchema,
  residentIdParamSchema,
} from '../../../validations/residentLabReport.validation.js'
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
import {
  getDoctorShifts,
  getDoctorShiftBookings,
  getDoctorShiftResidents,
  ensureDoctorShiftAppointment,
} from '../controllers/doctorShift.controller.js'
import { getResidentClinical } from '../controllers/doctorClinical.controller.js'
import {
  getAppointmentDiagnosis,
  upsertAppointmentDiagnosis,
  submitAppointmentDiagnosis,
  listVitalSettingsForDoctor,
} from '../controllers/doctorDiagnosis.controller.js'
import { listLocationMedicines } from '../controllers/doctorMedication.controller.js'
import {
  listLabTestSettingsForDoctor,
  listResidentLabReports,
  createResidentLabReport,
} from '../controllers/doctorLabReport.controller.js'

const router = Router()

const uploadLabReportFiles = upload.fields([
  { name: 'report', maxCount: 1 },
  { name: 'receipt', maxCount: 1 },
])

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

// ── Doctor Shift / Roster (Visiting + In-house) ──────────────────────────────
router.get('/doctor/shifts', getDoctorShifts)
router.get('/doctor/shifts/:shiftEmployeeDateId/bookings', getDoctorShiftBookings)
router.get('/doctor/shifts/:shiftEmployeeDateId/residents', getDoctorShiftResidents)
router.post(
  '/doctor/shifts/:shiftEmployeeDateId/residents/:residentId/ensure-appointment',
  ensureDoctorShiftAppointment,
)

// ── Doctor Appointment Diagnosis (consultants table) ─────────────────────────
router.get('/doctor/appointments/:appointmentId/diagnosis', getAppointmentDiagnosis)
router.put('/doctor/appointments/:appointmentId/diagnosis', upsertAppointmentDiagnosis)
router.post('/doctor/appointments/:appointmentId/diagnosis/submit', submitAppointmentDiagnosis)
router.get('/doctor/vital-settings', listVitalSettingsForDoctor)
router.get('/doctor/lab-test-settings', listLabTestSettingsForDoctor)

// ── Doctor Resident Clinical Chart (aggregated from consultants) ─────────────
router.get('/doctor/residents/:residentId/clinical', getResidentClinical)
router.get('/doctor/locations/:locationId/medicines', listLocationMedicines)

// ── Doctor Resident Lab Reports ──────────────────────────────────────────────
router.get('/doctor/residents/:residentId/lab-reports', validateParams(residentIdParamSchema), listResidentLabReports)
router.post(
  '/doctor/residents/:residentId/lab-reports',
  validateParams(residentIdParamSchema),
  uploadLabReportFiles,
  validateBody(createResidentLabReportSchema),
  createResidentLabReport,
)

// ── Doctor Resident Endpoints ────────────────────────────────────────────────
router.get('/doctor/residents', getDoctorResidents)
router.get('/doctor/residents/:id', getDoctorResidentDetails)

export default router
