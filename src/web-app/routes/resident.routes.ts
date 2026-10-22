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
  getResidentClinicalData,
  getResidentLabReports,
  getResidentTimelineData,
  getResidentDocuments,
  createResidentDocument,
  updateResidentCondition,
} from '../controllers/resident.controller.js'
import {
  getResidentMedicines,
  createResidentMedication,
  updateResidentMedication,
  deleteResidentMedication,
  createResidentInsulin,
  updateResidentInsulin,
  deleteResidentInsulin,
  getResidentMedicationAdministrations,
  createResidentVital,
  updateResidentVital,
  deleteResidentVital,
  createResidentAllergy,
  updateResidentAllergy,
  deleteResidentAllergy,
  createResidentLabReport,
  updateResidentLabReport,
  deleteResidentLabReport,
  createResidentFluidBalance,
  updateResidentFluidBalance,
  deleteResidentFluidBalance,
  createResidentIncident,
  updateResidentIncident,
  deleteResidentIncident,
  MAX_INCIDENT_PHOTOS,
  MAX_INCIDENT_VOICE_NOTES,
} from '../controllers/residentClinical.controller.js'
import {
  getResidentNokContacts,
  createResidentNokContact,
  updateResidentNokContact,
  deleteResidentNokContact,
} from '../controllers/residentNok.controller.js'
import {
  createResidentGuardian,
  deleteResidentGuardian,
  getResidentGuardians,
  updateResidentGuardian,
} from '../controllers/residentGuardian.controller.js'
import {
  createResidentNokContactSchema,
  updateResidentNokContactSchema,
} from '../../validations/residentNokContact.validation.js'
import {
  createResidentGuardianSchema,
  updateResidentGuardianSchema,
} from '../../validations/residentGuardian.validation.js'
import { upload } from '../../middlewares/upload.js'
import { authenticate } from '../../middlewares/authenticate.js'
import { validateBody, validateParams, validateQuery } from '../../middlewares/validate/index.js'
import {
  createResidentLabReportSchema,
  residentClinicalItemParamSchema,
  residentIdParamSchema,
  updateResidentLabReportSchema,
} from '../../validations/residentLabReport.validation.js'
import {
  createResidentMedicationSchema,
  updateResidentMedicationSchema,
} from '../../validations/residentMedication.validation.js'
import { listMedicationAdministrationsQuerySchema } from '../../validations/medicationTask.validation.js'
import { createResidentVitalSchema, updateResidentVitalSchema } from '../../validations/residentVital.validation.js'
import {
  createResidentAllergySchema,
  updateResidentAllergySchema,
} from '../../validations/residentAllergy.validation.js'
import {
  createResidentFluidBalanceSchema,
  updateResidentFluidBalanceSchema,
} from '../../validations/residentFluidBalance.validation.js'
import {
  createResidentIncidentSchema,
  updateResidentIncidentSchema,
} from '../../validations/residentIncident.validation.js'
import { residentTimelineQuerySchema } from '../../validations/residentTimeline.validation.js'
import { createResidentDocumentSchema } from '../../validations/residentDocument.validation.js'
import { updateResidentConditionSchema } from '../../validations/residentCondition.validation.js'

const router = Router()

// Every resident route needs a signed-in user.
router.use(authenticate)

const uploadResidentPhoto = upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'avatar', maxCount: 1 },
  { name: 'image', maxCount: 1 },
])

const uploadResidentDocument = upload.fields([{ name: 'file', maxCount: 1 }])

const uploadLabReportFiles = upload.fields([
  { name: 'report', maxCount: 1 },
  { name: 'receipt', maxCount: 1 },
])

const uploadIncidentFiles = upload.fields([
  { name: 'photos', maxCount: MAX_INCIDENT_PHOTOS },
  { name: 'voiceNote', maxCount: MAX_INCIDENT_VOICE_NOTES },
])

const uploadNokPhoto = upload.fields([{ name: 'photo', maxCount: 1 }])
const uploadGuardianPhoto = upload.fields([{ name: 'photo', maxCount: 1 }])

// Resident Billing
router.get('/billing', getResidentBillingData)
router.get('/billing/:id', getResidentBillingData)
router.get('/:id/billing', getResidentBillingData)

// ── Care Team routes ───────────────────────────────────────────────────────
router.get('/:residentId/care-team', getResidentCareTeam)
router.post('/:residentId/care-team', assignCareTeamMember)
router.delete('/:residentId/care-team/:memberId', removeCareTeamMember)

// ── Clinical chart routes ──────────────────────────────────────────────────
router.get('/:residentId/clinical', authenticate, getResidentClinicalData)
router.post(
  '/:residentId/condition',
  authenticate,
  validateParams(residentIdParamSchema),
  validateBody(updateResidentConditionSchema),
  updateResidentCondition,
)
router.get('/:residentId/lab-reports', authenticate, getResidentLabReports)
router.post(
  '/:residentId/lab-reports',
  authenticate,
  validateParams(residentIdParamSchema),
  uploadLabReportFiles,
  validateBody(createResidentLabReportSchema),
  createResidentLabReport,
)
router.put(
  '/:residentId/lab-reports/:id',
  authenticate,
  validateParams(residentClinicalItemParamSchema),
  uploadLabReportFiles,
  validateBody(updateResidentLabReportSchema),
  updateResidentLabReport,
)
router.delete(
  '/:residentId/lab-reports/:id',
  authenticate,
  validateParams(residentClinicalItemParamSchema),
  deleteResidentLabReport,
)

router.get('/:residentId/medicines', authenticate, validateParams(residentIdParamSchema), getResidentMedicines)
router.post(
  '/:residentId/medications',
  authenticate,
  validateParams(residentIdParamSchema),
  validateBody(createResidentMedicationSchema),
  createResidentMedication,
)
router.put(
  '/:residentId/medications/:id',
  authenticate,
  validateParams(residentClinicalItemParamSchema),
  validateBody(updateResidentMedicationSchema),
  updateResidentMedication,
)
router.delete(
  '/:residentId/medications/:id',
  authenticate,
  validateParams(residentClinicalItemParamSchema),
  deleteResidentMedication,
)

router.post(
  '/:residentId/insulin',
  authenticate,
  validateParams(residentIdParamSchema),
  validateBody(createResidentMedicationSchema),
  createResidentInsulin,
)
router.put(
  '/:residentId/insulin/:id',
  authenticate,
  validateParams(residentClinicalItemParamSchema),
  validateBody(updateResidentMedicationSchema),
  updateResidentInsulin,
)
router.delete(
  '/:residentId/insulin/:id',
  authenticate,
  validateParams(residentClinicalItemParamSchema),
  deleteResidentInsulin,
)

router.get(
  '/:residentId/medication-administrations',
  authenticate,
  validateParams(residentIdParamSchema),
  validateQuery(listMedicationAdministrationsQuerySchema),
  getResidentMedicationAdministrations,
)

router.post(
  '/:residentId/vitals',
  authenticate,
  validateParams(residentIdParamSchema),
  validateBody(createResidentVitalSchema),
  createResidentVital,
)
router.put(
  '/:residentId/vitals/:id',
  authenticate,
  validateParams(residentClinicalItemParamSchema),
  validateBody(updateResidentVitalSchema),
  updateResidentVital,
)
router.delete(
  '/:residentId/vitals/:id',
  authenticate,
  validateParams(residentClinicalItemParamSchema),
  deleteResidentVital,
)

router.post(
  '/:residentId/allergies',
  authenticate,
  validateParams(residentIdParamSchema),
  validateBody(createResidentAllergySchema),
  createResidentAllergy,
)
router.put(
  '/:residentId/allergies/:id',
  authenticate,
  validateParams(residentClinicalItemParamSchema),
  validateBody(updateResidentAllergySchema),
  updateResidentAllergy,
)
router.delete(
  '/:residentId/allergies/:id',
  authenticate,
  validateParams(residentClinicalItemParamSchema),
  deleteResidentAllergy,
)

router.post(
  '/:residentId/fluid-balance',
  authenticate,
  validateParams(residentIdParamSchema),
  validateBody(createResidentFluidBalanceSchema),
  createResidentFluidBalance,
)
router.put(
  '/:residentId/fluid-balance/:id',
  authenticate,
  validateParams(residentClinicalItemParamSchema),
  validateBody(updateResidentFluidBalanceSchema),
  updateResidentFluidBalance,
)
router.delete(
  '/:residentId/fluid-balance/:id',
  authenticate,
  validateParams(residentClinicalItemParamSchema),
  deleteResidentFluidBalance,
)

router.post(
  '/:residentId/incidents',
  authenticate,
  validateParams(residentIdParamSchema),
  uploadIncidentFiles,
  validateBody(createResidentIncidentSchema),
  createResidentIncident,
)
router.put(
  '/:residentId/incidents/:id',
  authenticate,
  validateParams(residentClinicalItemParamSchema),
  uploadIncidentFiles,
  validateBody(updateResidentIncidentSchema),
  updateResidentIncident,
)
router.delete(
  '/:residentId/incidents/:id',
  authenticate,
  validateParams(residentClinicalItemParamSchema),
  deleteResidentIncident,
)

router.get(
  '/:residentId/timeline',
  authenticate,
  validateParams(residentIdParamSchema),
  validateQuery(residentTimelineQuerySchema),
  getResidentTimelineData,
)

// ── Resident documents ─────────────────────────────────────────────────────
router.get('/:residentId/documents', authenticate, validateParams(residentIdParamSchema), getResidentDocuments)
router.post(
  '/:residentId/documents',
  authenticate,
  validateParams(residentIdParamSchema),
  uploadResidentDocument,
  validateBody(createResidentDocumentSchema),
  createResidentDocument,
)

// ── Resident NOK contacts ──────────────────────────────────────────────────
router.get('/:residentId/nok-contacts', validateParams(residentIdParamSchema), getResidentNokContacts)
router.post(
  '/:residentId/nok-contacts',
  validateParams(residentIdParamSchema),
  uploadNokPhoto,
  validateBody(createResidentNokContactSchema),
  createResidentNokContact,
)
router.put(
  '/:residentId/nok-contacts/:id',
  validateParams(residentClinicalItemParamSchema),
  uploadNokPhoto,
  validateBody(updateResidentNokContactSchema),
  updateResidentNokContact,
)
router.delete(
  '/:residentId/nok-contacts/:id',
  validateParams(residentClinicalItemParamSchema),
  deleteResidentNokContact,
)

// ── Resident guardians (non-residing family who look after the flat's residents) ──
router.get('/:residentId/guardians', validateParams(residentIdParamSchema), getResidentGuardians)
router.post(
  '/:residentId/guardians',
  validateParams(residentIdParamSchema),
  uploadGuardianPhoto,
  validateBody(createResidentGuardianSchema),
  createResidentGuardian,
)
router.put(
  '/:residentId/guardians/:id',
  validateParams(residentClinicalItemParamSchema),
  uploadGuardianPhoto,
  validateBody(updateResidentGuardianSchema),
  updateResidentGuardian,
)
router.delete('/:residentId/guardians/:id', validateParams(residentClinicalItemParamSchema), deleteResidentGuardian)

// Resident Onboarding & Operations
router.post('/', uploadResidentPhoto, createResident)
router.get('/', getAllResidents)
router.get('/unit/:unitId', getResidentsByUnit)
router.get('/:id', getResidentById)
router.put('/:id', uploadResidentPhoto, updateResident)
router.delete('/:id', deleteResident)

export default router
