import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import { authenticate } from '../../../middlewares/authenticate.js'
import { upload } from '../../../middlewares/upload.js'
import { validateBody, validateParams, validateQuery } from '../../../middlewares/validate/index.js'
import {
  createResidentLabReportSchema,
  residentIdParamSchema,
} from '../../../validations/residentLabReport.validation.js'
import { createResidentVitalSchema } from '../../../validations/residentVital.validation.js'
import {
  createResidentFluidBalanceSchema,
  listResidentFluidBalanceQuerySchema,
} from '../../../validations/residentFluidBalance.validation.js'
import {
  cancelMedicationTaskSchema,
  completeMedicationTaskSchema,
  listMedicationTasksQuerySchema,
  medicationTaskDetailQuerySchema,
  medicationTaskParamsSchema,
} from '../../../validations/medicationTask.validation.js'
import {
  MAX_MEDICATION_TASK_PHOTOS,
  MAX_MEDICATION_TASK_VOICE_NOTES,
} from '../../../services/medicationTask.service.js'
import {
  cancelNurseMedicationTask,
  completeNurseMedicationTask,
  getNurseMedicationTaskDetail,
  getNurseMedicationTasks,
} from '../controllers/nurseMedication.controller.js'
import {
  createResidentIncidentSchema,
  incidentSopParamsSchema,
  updateIncidentSopStepSchema,
} from '../../../validations/residentIncident.validation.js'
import {
  addNurseResidentFluidBalance,
  addNurseResidentIncident,
  addNurseResidentVital,
  getNurseIncidentSop,
  getNurseResidentFluidBalanceHistory,
  getNurseResidentFluidBalanceSummary,
  getNurseResidentIncidents,
  updateNurseIncidentSopStep,
  MAX_INCIDENT_PHOTOS,
  MAX_INCIDENT_VOICE_NOTES,
} from '../controllers/nurseClinical.controller.js'
import {
  getNurseCareTasks,
  completeNurseCareTask,
  getNurseResidents,
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
  uploadDiagnosisAttachments,
  deleteDiagnosisAttachment,
  MAX_DIAGNOSIS_FILES,
  MAX_DIAGNOSIS_VOICE_NOTES,
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

const diagnosisFilesUpload = upload.fields([
  { name: 'files', maxCount: MAX_DIAGNOSIS_FILES },
  { name: 'voiceNotes', maxCount: MAX_DIAGNOSIS_VOICE_NOTES },
])

/** Returns multer failures (file too large, unexpected field, too many files) as 400s. */
function handleDiagnosisUpload(req: Request, res: Response, next: NextFunction): void {
  diagnosisFilesUpload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Each file must be 10MB or smaller'
          : err.code === 'LIMIT_UNEXPECTED_FILE'
            ? `Unexpected or too many files for field "${err.field}" (files: max ${MAX_DIAGNOSIS_FILES}, voiceNotes: max ${MAX_DIAGNOSIS_VOICE_NOTES})`
            : err.message
      res.status(400).json({ success: false, message })
      return
    }
    if (err) {
      next(err)
      return
    }
    next()
  })
}

const medicationTaskUpload = upload.fields([
  { name: 'photos', maxCount: MAX_MEDICATION_TASK_PHOTOS },
  { name: 'voiceNote', maxCount: MAX_MEDICATION_TASK_VOICE_NOTES },
])

function handleMedicationTaskUpload(req: Request, res: Response, next: NextFunction): void {
  medicationTaskUpload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Each file must be 10MB or smaller'
          : err.code === 'LIMIT_UNEXPECTED_FILE'
            ? `Unexpected or too many files for field "${err.field}" (photos: max ${MAX_MEDICATION_TASK_PHOTOS}, voiceNote: max ${MAX_MEDICATION_TASK_VOICE_NOTES})`
            : err.message
      res.status(400).json({ success: false, message })
      return
    }
    if (err) {
      next(err)
      return
    }
    next()
  })
}

const incidentUpload = upload.fields([
  { name: 'photos', maxCount: MAX_INCIDENT_PHOTOS },
  { name: 'voiceNote', maxCount: MAX_INCIDENT_VOICE_NOTES },
])

function handleIncidentUpload(req: Request, res: Response, next: NextFunction): void {
  incidentUpload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Each file must be 10MB or smaller'
          : err.code === 'LIMIT_UNEXPECTED_FILE'
            ? `Unexpected or too many files for field "${err.field}" (photos: max ${MAX_INCIDENT_PHOTOS}, voiceNote: max ${MAX_INCIDENT_VOICE_NOTES})`
            : err.message
      res.status(400).json({ success: false, message })
      return
    }
    if (err) {
      next(err)
      return
    }
    next()
  })
}

// Require authentication for L3 medical staff endpoints
router.use(authenticate)

// ── Nurse Endpoints ──────────────────────────────────────────────────────────
router.get('/care-tasks', getNurseCareTasks)
router.post('/care-tasks/:id/complete', completeNurseCareTask)
router.get('/nurse/residents', getNurseResidents)
router.post(
  '/nurse/residents/:residentId/vitals',
  validateParams(residentIdParamSchema),
  validateBody(createResidentVitalSchema),
  addNurseResidentVital,
)
router.get(
  '/nurse/residents/:residentId/fluid-balance/summary',
  validateParams(residentIdParamSchema),
  getNurseResidentFluidBalanceSummary,
)
router.get(
  '/nurse/residents/:residentId/fluid-balance',
  validateParams(residentIdParamSchema),
  validateQuery(listResidentFluidBalanceQuerySchema),
  getNurseResidentFluidBalanceHistory,
)
router.get('/nurse/residents/:residentId/incidents', validateParams(residentIdParamSchema), getNurseResidentIncidents)
router.post(
  '/nurse/residents/:residentId/incidents',
  validateParams(residentIdParamSchema),
  handleIncidentUpload,
  validateBody(createResidentIncidentSchema),
  addNurseResidentIncident,
)
router.get(
  '/nurse/residents/:residentId/incidents/:incidentId/sop',
  validateParams(incidentSopParamsSchema),
  getNurseIncidentSop,
)
router.patch(
  '/nurse/residents/:residentId/incidents/:incidentId/sop/:stepId',
  validateParams(incidentSopParamsSchema),
  validateBody(updateIncidentSopStepSchema),
  updateNurseIncidentSopStep,
)
router.post(
  '/nurse/residents/:residentId/fluid-balance',
  validateParams(residentIdParamSchema),
  validateBody(createResidentFluidBalanceSchema),
  addNurseResidentFluidBalance,
)
router.get('/medication-tasks', validateQuery(listMedicationTasksQuerySchema), getNurseMedicationTasks)
router.post(
  '/medication-tasks/complete',
  handleMedicationTaskUpload,
  validateBody(completeMedicationTaskSchema),
  completeNurseMedicationTask,
)
router.post(
  '/medication-tasks/cancel',
  handleMedicationTaskUpload,
  validateBody(cancelMedicationTaskSchema),
  cancelNurseMedicationTask,
)
router.get(
  '/medication-tasks/:kind/:medicationId',
  validateParams(medicationTaskParamsSchema),
  validateQuery(medicationTaskDetailQuerySchema),
  getNurseMedicationTaskDetail,
)

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
router.post(
  '/doctor/appointments/:appointmentId/diagnosis/attachments',
  handleDiagnosisUpload,
  uploadDiagnosisAttachments,
)
router.delete('/doctor/appointments/:appointmentId/diagnosis/attachments/:fileId', deleteDiagnosisAttachment)
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
