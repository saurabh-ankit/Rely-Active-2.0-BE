import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { HttpError } from '../../../middlewares/error/http-error.js'
import {
  createResidentFluidBalance,
  getResidentFluidBalanceSummary,
  listResidentFluidBalanceByDate,
} from '../../../services/residentFluidBalance.service.js'
import { getIncidentSop, updateIncidentSopStep } from '../../../services/incidentSop.service.js'
import { createResidentIncident, listResidentIncidents } from '../../../services/residentIncident.service.js'
import { createResidentVital } from '../../../services/residentVital.service.js'
import type {
  CreateResidentIncidentInput,
  UpdateIncidentSopStepInput,
} from '../../../validations/residentIncident.validation.js'
import type {
  CreateResidentFluidBalanceInput,
  ListResidentFluidBalanceQuery,
} from '../../../validations/residentFluidBalance.validation.js'
import type { CreateResidentVitalInput } from '../../../validations/residentVital.validation.js'
import { assertDoctorClinicalAccess } from './doctorClinical.controller.js'
import { getTodayDateStr } from './medical.controller.js'

export const MAX_INCIDENT_PHOTOS = 5
export const MAX_INCIDENT_VOICE_NOTES = 1

function sendError(res: Response, err: unknown, logLabel: string): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, message: err.message })
    return
  }
  console.error(logLabel, err)
  res.status(500).json({ success: false, message: err instanceof Error ? err.message : 'Unknown error' })
}

/**
 * POST /nurse/residents/:residentId/vitals
 * Records a vital reading for a resident on the caller's care team.
 */
export async function addNurseResidentVital(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = String(req.params.residentId || '').trim()
    if (!residentId) {
      throw new HttpError(400, 'Resident ID is required')
    }

    const access = await assertDoctorClinicalAccess(req, residentId)
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message })
      return
    }

    const data = await createResidentVital({
      residentId,
      input: req.body as CreateResidentVitalInput,
      userId: req.user?.id ?? null,
    })
    res.status(201).json({ success: true, message: 'Vital added successfully', data })
  } catch (err) {
    sendError(res, err, 'addNurseResidentVital')
  }
}

/**
 * POST /nurse/residents/:residentId/fluid-balance
 * Saves fluid intakes, fluid outputs and a bowel movement as one batch.
 */
export async function addNurseResidentFluidBalance(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = String(req.params.residentId || '').trim()
    if (!residentId) {
      throw new HttpError(400, 'Resident ID is required')
    }

    const access = await assertDoctorClinicalAccess(req, residentId)
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message })
      return
    }

    const data = await createResidentFluidBalance({
      residentId,
      input: req.body as CreateResidentFluidBalanceInput,
      userId: req.user?.id ?? null,
    })
    res.status(201).json({ success: true, message: 'Fluid balance saved successfully', data })
  } catch (err) {
    sendError(res, err, 'addNurseResidentFluidBalance')
  }
}

/**
 * GET /nurse/residents/:residentId/fluid-balance?date=YYYY-MM-DD
 * Fluid balance history for one day (defaults to today).
 */
export async function getNurseResidentFluidBalanceHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = String(req.params.residentId || '').trim()
    if (!residentId) {
      throw new HttpError(400, 'Resident ID is required')
    }

    const access = await assertDoctorClinicalAccess(req, residentId)
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message })
      return
    }

    const date = (req.query as ListResidentFluidBalanceQuery).date ?? getTodayDateStr()
    const data = await listResidentFluidBalanceByDate(residentId, date)
    res.status(200).json({ success: true, message: 'Fluid balance history fetched successfully', data })
  } catch (err) {
    sendError(res, err, 'getNurseResidentFluidBalanceHistory')
  }
}

/**
 * GET /nurse/residents/:residentId/fluid-balance/summary
 * Intake, output and net totals over the last 24 hours.
 */
export async function getNurseResidentFluidBalanceSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = String(req.params.residentId || '').trim()
    if (!residentId) {
      throw new HttpError(400, 'Resident ID is required')
    }

    const access = await assertDoctorClinicalAccess(req, residentId)
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message })
      return
    }

    const data = await getResidentFluidBalanceSummary(residentId)
    res.status(200).json({ success: true, message: 'Fluid balance summary fetched successfully', data })
  } catch (err) {
    sendError(res, err, 'getNurseResidentFluidBalanceSummary')
  }
}

/**
 * GET /nurse/residents/:residentId/incidents
 * The resident's incident history, newest first.
 */
export async function getNurseResidentIncidents(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = String(req.params.residentId || '').trim()
    if (!residentId) {
      throw new HttpError(400, 'Resident ID is required')
    }

    const access = await assertDoctorClinicalAccess(req, residentId)
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message })
      return
    }

    const data = await listResidentIncidents(residentId)
    res.status(200).json({ success: true, message: 'Incidents fetched successfully', data })
  } catch (err) {
    sendError(res, err, 'getNurseResidentIncidents')
  }
}

/**
 * POST /nurse/residents/:residentId/incidents (multipart/form-data)
 * Fields: incidentType, severity, incidentAt, notes. Files: photos[] (max 5), voiceNote (max 1).
 */
export async function addNurseResidentIncident(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = String(req.params.residentId || '').trim()
    if (!residentId) {
      throw new HttpError(400, 'Resident ID is required')
    }

    const access = await assertDoctorClinicalAccess(req, residentId)
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message })
      return
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined
    const photos = files?.photos ?? []
    const voiceNotes = files?.voiceNote ?? []
    if (photos.some((file) => !file.mimetype.startsWith('image/'))) {
      throw new HttpError(400, 'Photos must be image files')
    }
    if (voiceNotes.some((file) => !file.mimetype.startsWith('audio/') && file.mimetype !== 'video/webm')) {
      throw new HttpError(400, 'Voice note must be an audio file')
    }

    const data = await createResidentIncident({
      residentId,
      input: req.body as CreateResidentIncidentInput,
      userId: req.user?.id ?? null,
      files: { photos, voiceNotes },
    })
    res.status(201).json({ success: true, message: 'Incident added successfully', data })
  } catch (err) {
    sendError(res, err, 'addNurseResidentIncident')
  }
}

/**
 * GET /nurse/residents/:residentId/incidents/:incidentId/sop
 * The incident's SOP checklist (Skin/Wound and Fall/Injury only).
 */
export async function getNurseIncidentSop(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = String(req.params.residentId || '').trim()
    const incidentId = String(req.params.incidentId || '').trim()
    if (!residentId || !incidentId) {
      throw new HttpError(400, 'Resident ID and incident ID are required')
    }

    const access = await assertDoctorClinicalAccess(req, residentId)
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message })
      return
    }

    const data = await getIncidentSop(residentId, incidentId)
    res.status(200).json({ success: true, message: 'Incident SOP fetched successfully', data })
  } catch (err) {
    sendError(res, err, 'getNurseIncidentSop')
  }
}

/**
 * PATCH /nurse/residents/:residentId/incidents/:incidentId/sop/:stepId
 * Marks an SOP step done / not done and/or saves its note.
 */
export async function updateNurseIncidentSopStep(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = String(req.params.residentId || '').trim()
    const incidentId = String(req.params.incidentId || '').trim()
    const stepId = String(req.params.stepId || '').trim()
    if (!residentId || !incidentId || !stepId) {
      throw new HttpError(400, 'Resident ID, incident ID and step ID are required')
    }

    const access = await assertDoctorClinicalAccess(req, residentId)
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message })
      return
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
    sendError(res, err, 'updateNurseIncidentSopStep')
  }
}
