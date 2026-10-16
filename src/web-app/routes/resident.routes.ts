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
} from '../controllers/residentClinical.controller.js'
import {
  getResidentNokContacts,
  createResidentNokContact,
  updateResidentNokContact,
  deleteResidentNokContact,
} from '../controllers/residentNok.controller.js'
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
import { residentTimelineQuerySchema } from '../../validations/residentTimeline.validation.js'
import { createResidentDocumentSchema } from '../../validations/residentDocument.validation.js'
import { updateResidentConditionSchema } from '../../validations/residentCondition.validation.js'
import {
  createResidentNokContactSchema,
  updateResidentNokContactSchema,
} from '../../validations/residentNokContact.validation.js'

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

const uploadNokPhoto = upload.fields([{ name: 'photo', maxCount: 1 }])

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

// Resident Onboarding & Operations
router.post('/', uploadResidentPhoto, createResident)
router.get('/', getAllResidents)
router.get('/unit/:unitId', getResidentsByUnit)
router.get('/:id', getResidentById)
router.put('/:id', uploadResidentPhoto, updateResident)
router.delete('/:id', deleteResident)

export default router
