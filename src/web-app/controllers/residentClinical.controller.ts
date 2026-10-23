import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { HttpError } from '../../middlewares/error/http-error.js'
import { getClinicalResident } from '../../services/residentClinical.service.js'
import {
  createResidentMedication as createMedication,
  deleteResidentMedication as deleteMedication,
  listLocationMedicinesData,
  updateResidentMedication as updateMedication,
} from '../../services/residentMedication.service.js'
import {
  createResidentInsulin as createInsulin,
  deleteResidentInsulin as deleteInsulin,
  updateResidentInsulin as updateInsulin,
} from '../../services/residentInsulin.service.js'
import {
  createResidentVital as createVital,
  deleteResidentVital as deleteVital,
  updateResidentVital as updateVital,
} from '../../services/residentVital.service.js'
import {
  createResidentAllergy as createAllergy,
  deleteResidentAllergy as deleteAllergy,
  updateResidentAllergy as updateAllergy,
} from '../../services/residentAllergy.service.js'
import {
  createResidentLabReport as createLabReport,
  deleteResidentLabReport as deleteLabReport,
  type LabReportFiles,
  updateResidentLabReport as updateLabReport,
} from '../../services/residentLabReport.service.js'
import {
  createResidentFluidBalance as createFluidBalance,
  deleteResidentFluidBalanceEntry as deleteFluidBalance,
  getResidentFluidBalanceSummary as getFluidBalanceSummary,
  listResidentFluidBalanceByDate,
  updateResidentFluidBalanceEntry as updateFluidBalance,
} from '../../services/residentFluidBalance.service.js'
import { getTodayDateStr } from '../../mobile-app/L3/controllers/medical.controller.js'
import {
  createResidentIncident as createIncident,
  deleteResidentIncident as deleteIncident,
  updateResidentIncident as updateIncident,
} from '../../services/residentIncident.service.js'
import { getIncidentSop, updateIncidentSopStep } from '../../services/incidentSop.service.js'
import { listMedicationAdministrations } from '../../services/medicationTask.service.js'
import type {
  CreateResidentMedicationInput,
  UpdateResidentMedicationInput,
} from '../../validations/residentMedication.validation.js'
import type { ListMedicationAdministrationsQuery } from '../../validations/medicationTask.validation.js'
import type { CreateResidentVitalInput, UpdateResidentVitalInput } from '../../validations/residentVital.validation.js'
import type {
  CreateResidentAllergyInput,
  UpdateResidentAllergyInput,
} from '../../validations/residentAllergy.validation.js'
import type {
  CreateResidentLabReportInput,
  UpdateResidentLabReportInput,
} from '../../validations/residentLabReport.validation.js'
import type {
  CreateResidentFluidBalanceInput,
  ListResidentFluidBalanceQuery,
  UpdateResidentFluidBalanceInput,
} from '../../validations/residentFluidBalance.validation.js'
import type {
  CreateResidentIncidentInput,
  UpdateIncidentSopStepInput,
  UpdateResidentIncidentInput,
} from '../../validations/residentIncident.validation.js'

export const MAX_INCIDENT_PHOTOS = 5
export const MAX_INCIDENT_VOICE_NOTES = 1

function sendError(res: Response, err: unknown, logLabel: string): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      success: false,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    })
    return
  }
  console.error(logLabel, err)
  res.status(500).json({
    success: false,
    message: err instanceof Error ? err.message : 'Unknown error',
  })
}

function itemParams(req: AuthenticatedRequest): { residentId: string; id: string; userId: string | null } {
  return {
    residentId: String(req.params.residentId),
    id: String(req.params.id),
    userId: req.user?.id ?? null,
  }
}

function labReportFiles(req: AuthenticatedRequest): LabReportFiles {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined
  const reportFile = files?.report?.[0]
  const receiptFile = files?.receipt?.[0]
  return { ...(reportFile ? { reportFile } : {}), ...(receiptFile ? { receiptFile } : {}) }
}

// ── Medicines ────────────────────────────────────────────────────────────────

/**
 * GET /residents/:residentId/medicines?search&packType&excludePackType
 * Medicines available at the resident's location, for the medication/insulin picker.
 */
export async function getResidentMedicines(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const resident = await getClinicalResident(String(req.params.residentId))
    const medicines = await listLocationMedicinesData(resident.locId, {
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      packType: typeof req.query.packType === 'string' ? req.query.packType : undefined,
      excludePackType: typeof req.query.excludePackType === 'string' ? req.query.excludePackType : undefined,
      limit: Number(req.query.limit) || 100,
    })
    res.status(200).json({ success: true, message: 'Medicines fetched successfully', data: { medicines } })
  } catch (err) {
    sendError(res, err, 'getResidentMedicines')
  }
}

// ── Medications ──────────────────────────────────────────────────────────────

/**
 * POST /residents/:residentId/medications
 */
export async function createResidentMedication(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await createMedication({
      residentId: String(req.params.residentId),
      input: req.body as CreateResidentMedicationInput,
      userId: req.user?.id ?? null,
    })
    res.status(201).json({ success: true, message: 'Medication added successfully', data })
  } catch (err) {
    sendError(res, err, 'createResidentMedication')
  }
}

/**
 * PUT /residents/:residentId/medications/:id
 */
export async function updateResidentMedication(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await updateMedication({ ...itemParams(req), input: req.body as UpdateResidentMedicationInput })
    res.status(200).json({ success: true, message: 'Medication updated successfully', data })
  } catch (err) {
    sendError(res, err, 'updateResidentMedication')
  }
}

/**
 * DELETE /residents/:residentId/medications/:id (soft)
 */
export async function deleteResidentMedication(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    await deleteMedication(itemParams(req))
    res.status(200).json({ success: true, message: 'Medication deleted successfully' })
  } catch (err) {
    sendError(res, err, 'deleteResidentMedication')
  }
}

// ── Insulin ──────────────────────────────────────────────────────────────────

/**
 * POST /residents/:residentId/insulin
 */
export async function createResidentInsulin(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await createInsulin({
      residentId: String(req.params.residentId),
      input: req.body as CreateResidentMedicationInput,
      userId: req.user?.id ?? null,
    })
    res.status(201).json({ success: true, message: 'Insulin added successfully', data })
  } catch (err) {
    sendError(res, err, 'createResidentInsulin')
  }
}

/**
 * PUT /residents/:residentId/insulin/:id
 */
export async function updateResidentInsulin(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await updateInsulin({ ...itemParams(req), input: req.body as UpdateResidentMedicationInput })
    res.status(200).json({ success: true, message: 'Insulin updated successfully', data })
  } catch (err) {
    sendError(res, err, 'updateResidentInsulin')
  }
}

/**
 * DELETE /residents/:residentId/insulin/:id (soft)
 */
export async function deleteResidentInsulin(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    await deleteInsulin(itemParams(req))
    res.status(200).json({ success: true, message: 'Insulin deleted successfully' })
  } catch (err) {
    sendError(res, err, 'deleteResidentInsulin')
  }
}

// ── Medication administrations ───────────────────────────────────────────────

/**
 * GET /residents/:residentId/medication-administrations?date&kind&medicationId&limit
 * Doses nurses have marked as given (medication and insulin).
 */
export async function getResidentMedicationAdministrations(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const resident = await getClinicalResident(String(req.params.residentId))
    const data = await listMedicationAdministrations(resident.id, req.query as ListMedicationAdministrationsQuery)
    res.status(200).json({ success: true, message: 'Medication administrations fetched successfully', data })
  } catch (err) {
    sendError(res, err, 'getResidentMedicationAdministrations')
  }
}

// ── Vitals ───────────────────────────────────────────────────────────────────

/**
 * POST /residents/:residentId/vitals
 */
export async function createResidentVital(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await createVital({
      residentId: String(req.params.residentId),
      input: req.body as CreateResidentVitalInput,
      userId: req.user?.id ?? null,
    })
    res.status(201).json({ success: true, message: 'Vital added successfully', data })
  } catch (err) {
    sendError(res, err, 'createResidentVital')
  }
}

/**
 * PUT /residents/:residentId/vitals/:id
 */
export async function updateResidentVital(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await updateVital({ ...itemParams(req), input: req.body as UpdateResidentVitalInput })
    res.status(200).json({ success: true, message: 'Vital updated successfully', data })
  } catch (err) {
    sendError(res, err, 'updateResidentVital')
  }
}

/**
 * DELETE /residents/:residentId/vitals/:id (soft)
 */
export async function deleteResidentVital(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    await deleteVital(itemParams(req))
    res.status(200).json({ success: true, message: 'Vital deleted successfully' })
  } catch (err) {
    sendError(res, err, 'deleteResidentVital')
  }
}

// ── Allergies ────────────────────────────────────────────────────────────────

/**
 * POST /residents/:residentId/allergies
 */
export async function createResidentAllergy(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await createAllergy({
      residentId: String(req.params.residentId),
      input: req.body as CreateResidentAllergyInput,
      userId: req.user?.id ?? null,
    })
    res.status(201).json({ success: true, message: 'Allergy added successfully', data })
  } catch (err) {
    sendError(res, err, 'createResidentAllergy')
  }
}

/**
 * PUT /residents/:residentId/allergies/:id
 */
export async function updateResidentAllergy(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await updateAllergy({ ...itemParams(req), input: req.body as UpdateResidentAllergyInput })
    res.status(200).json({ success: true, message: 'Allergy updated successfully', data })
  } catch (err) {
    sendError(res, err, 'updateResidentAllergy')
  }
}

/**
 * DELETE /residents/:residentId/allergies/:id (soft)
 */
export async function deleteResidentAllergy(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    await deleteAllergy(itemParams(req))
    res.status(200).json({ success: true, message: 'Allergy deleted successfully' })
  } catch (err) {
    sendError(res, err, 'deleteResidentAllergy')
  }
}

// ── Lab reports ──────────────────────────────────────────────────────────────

/**
 * POST /residents/:residentId/lab-reports
 * Multipart: report (required), receipt (optional)
 */
export async function createResidentLabReport(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await createLabReport({
      residentId: String(req.params.residentId),
      input: req.body as CreateResidentLabReportInput,
      files: labReportFiles(req),
      userId: req.user?.id ?? null,
    })
    res.status(201).json({ success: true, message: 'Lab report uploaded successfully', data })
  } catch (err) {
    sendError(res, err, 'createResidentLabReport')
  }
}

/**
 * PUT /residents/:residentId/lab-reports/:id
 * Multipart: report (optional), receipt (optional), removeReceipt (optional)
 */
export async function updateResidentLabReport(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await updateLabReport({
      ...itemParams(req),
      input: req.body as UpdateResidentLabReportInput,
      files: labReportFiles(req),
    })
    res.status(200).json({ success: true, message: 'Lab report updated successfully', data })
  } catch (err) {
    sendError(res, err, 'updateResidentLabReport')
  }
}

/**
 * DELETE /residents/:residentId/lab-reports/:id (soft)
 */
export async function deleteResidentLabReport(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    await deleteLabReport(itemParams(req))
    res.status(200).json({ success: true, message: 'Lab report deleted successfully' })
  } catch (err) {
    sendError(res, err, 'deleteResidentLabReport')
  }
}

// ── Fluid balance ────────────────────────────────────────────────────────────

/**
 * GET /residents/:residentId/fluid-balance/summary
 * Intake, output and net totals over the last 24 hours.
 */
export async function getResidentFluidBalanceSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = String(req.params.residentId || '').trim()
    if (!residentId) {
      throw new HttpError(400, 'Resident ID is required')
    }

    const data = await getFluidBalanceSummary(residentId)
    res.status(200).json({ success: true, message: 'Fluid balance summary fetched successfully', data })
  } catch (err) {
    sendError(res, err, 'getResidentFluidBalanceSummary')
  }
}

/**
 * GET /residents/:residentId/fluid-balance?date=YYYY-MM-DD
 * Fluid balance history for one day (defaults to today).
 */
export async function getResidentFluidBalanceHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = String(req.params.residentId || '').trim()
    if (!residentId) {
      throw new HttpError(400, 'Resident ID is required')
    }

    const date = (req.query as ListResidentFluidBalanceQuery).date ?? getTodayDateStr()
    const data = await listResidentFluidBalanceByDate(residentId, date)
    res.status(200).json({ success: true, message: 'Fluid balance history fetched successfully', data })
  } catch (err) {
    sendError(res, err, 'getResidentFluidBalanceHistory')
  }
}

/**
 * POST /residents/:residentId/fluid-balance
 */
export async function createResidentFluidBalance(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await createFluidBalance({
      residentId: String(req.params.residentId),
      input: req.body as CreateResidentFluidBalanceInput,
      userId: req.user?.id ?? null,
    })
    res.status(201).json({ success: true, message: 'Fluid balance saved successfully', data })
  } catch (err) {
    sendError(res, err, 'createResidentFluidBalance')
  }
}

/**
 * PUT /residents/:residentId/fluid-balance/:id
 */
export async function updateResidentFluidBalance(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await updateFluidBalance({
      ...itemParams(req),
      input: req.body as UpdateResidentFluidBalanceInput,
    })
    res.status(200).json({ success: true, message: 'Fluid balance updated successfully', data })
  } catch (err) {
    sendError(res, err, 'updateResidentFluidBalance')
  }
}

/**
 * DELETE /residents/:residentId/fluid-balance/:id (soft)
 */
export async function deleteResidentFluidBalance(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    await deleteFluidBalance(itemParams(req))
    res.status(200).json({ success: true, message: 'Fluid balance deleted successfully' })
  } catch (err) {
    sendError(res, err, 'deleteResidentFluidBalance')
  }
}

// ── Incidents ────────────────────────────────────────────────────────────────

function incidentFiles(req: AuthenticatedRequest): {
  photos: Express.Multer.File[]
  voiceNotes: Express.Multer.File[]
} {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined
  const photos = files?.photos ?? []
  const voiceNotes = files?.voiceNote ?? []
  if (photos.some((file) => !file.mimetype.startsWith('image/'))) {
    throw new HttpError(400, 'Photos must be image files')
  }
  if (voiceNotes.some((file) => !file.mimetype.startsWith('audio/') && file.mimetype !== 'video/webm')) {
    throw new HttpError(400, 'Voice note must be an audio file')
  }
  return { photos, voiceNotes }
}

/**
 * POST /residents/:residentId/incidents (multipart)
 * Fields: incidentType, severity, incidentAt, notes. Files: photos (max 5), voiceNote (max 1).
 */
export async function createResidentIncident(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await createIncident({
      residentId: String(req.params.residentId),
      input: req.body as CreateResidentIncidentInput,
      userId: req.user?.id ?? null,
      files: incidentFiles(req),
    })
    res.status(201).json({ success: true, message: 'Incident added successfully', data })
  } catch (err) {
    sendError(res, err, 'createResidentIncident')
  }
}

/**
 * PUT /residents/:residentId/incidents/:id (multipart)
 * Fields: incidentType?, severity?, incidentAt?, notes?, removePhotoIds? (comma-separated UUIDs),
 * removeVoiceNote? (booleanish). Files: photos (appended, max 5 total), voiceNote (replaces existing).
 */
export async function updateResidentIncident(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await updateIncident({
      ...itemParams(req),
      input: req.body as UpdateResidentIncidentInput,
      files: incidentFiles(req),
    })
    res.status(200).json({ success: true, message: 'Incident updated successfully', data })
  } catch (err) {
    sendError(res, err, 'updateResidentIncident')
  }
}

/**
 * DELETE /residents/:residentId/incidents/:id (soft)
 */
export async function deleteResidentIncident(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    await deleteIncident(itemParams(req))
    res.status(200).json({ success: true, message: 'Incident deleted successfully' })
  } catch (err) {
    sendError(res, err, 'deleteResidentIncident')
  }
}

/**
 * GET /residents/:residentId/incidents/:incidentId/sop
 * The incident's SOP checklist (Skin/Wound and Fall/Injury only).
 */
export async function getResidentIncidentSop(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = String(req.params.residentId || '').trim()
    const incidentId = String(req.params.incidentId || '').trim()
    if (!residentId || !incidentId) {
      throw new HttpError(400, 'Resident ID and incident ID are required')
    }
    const data = await getIncidentSop(residentId, incidentId)
    res.status(200).json({ success: true, message: 'Incident SOP fetched successfully', data })
  } catch (err) {
    sendError(res, err, 'getResidentIncidentSop')
  }
}

/**
 * PATCH /residents/:residentId/incidents/:incidentId/sop/:stepId
 * Marks an SOP step done / not done and/or saves its note.
 */
export async function updateResidentIncidentSopStep(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = String(req.params.residentId || '').trim()
    const incidentId = String(req.params.incidentId || '').trim()
    const stepId = String(req.params.stepId || '').trim()
    if (!residentId || !incidentId || !stepId) {
      throw new HttpError(400, 'Resident ID, incident ID and step ID are required')
    }
    const data = await updateIncidentSopStep({
      residentId,
      incidentId,
      stepId,
      input: req.body as UpdateIncidentSopStepInput,
      userId: req.user?.id ?? null,
    })
    res.status(200).json({ success: true, message: 'SOP step updated successfully', data })
  } catch (err) {
    sendError(res, err, 'updateResidentIncidentSopStep')
  }
}
