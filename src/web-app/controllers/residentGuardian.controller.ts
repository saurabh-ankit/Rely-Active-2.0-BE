import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { HttpError } from '../../middlewares/error/http-error.js'
import {
  createResidentGuardian as createGuardian,
  deleteResidentGuardian as deleteGuardian,
  listCareRecipients,
  listResidentGuardians,
  updateResidentGuardian as updateGuardian,
} from '../../services/residentGuardian.service.js'
import type {
  CreateResidentGuardianInput,
  UpdateResidentGuardianInput,
} from '../../validations/residentGuardian.validation.js'

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
  res.status(500).json({ success: false, message: err instanceof Error ? err.message : 'Unknown error' })
}

function guardianPhoto(req: AuthenticatedRequest): { photo?: Express.Multer.File } {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined
  const photo = files?.photo?.[0]
  return photo ? { photo } : {}
}

/** GET /residents/:residentId/guardians — guardians of the flat and the residents they look after. */
export async function getResidentGuardians(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const residentId = String(req.params.residentId)
    const [guardians, careRecipients] = await Promise.all([
      listResidentGuardians(residentId),
      listCareRecipients(residentId),
    ])
    res
      .status(200)
      .json({ success: true, message: 'Guardians fetched successfully', data: { guardians, careRecipients } })
  } catch (err) {
    sendError(res, err, 'getResidentGuardians')
  }
}

/** POST /residents/:residentId/guardians (multipart, optional field: photo) */
export async function createResidentGuardian(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await createGuardian({
      residentId: String(req.params.residentId),
      input: req.body as CreateResidentGuardianInput,
      ...guardianPhoto(req),
      userId: req.user?.id ?? null,
    })
    res.status(201).json({ success: true, message: 'Guardian added successfully', data })
  } catch (err) {
    sendError(res, err, 'createResidentGuardian')
  }
}

/** PUT /residents/:residentId/guardians/:id (multipart, optional field: photo) */
export async function updateResidentGuardian(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await updateGuardian({
      residentId: String(req.params.residentId),
      id: String(req.params.id),
      input: req.body as UpdateResidentGuardianInput,
      ...guardianPhoto(req),
      userId: req.user?.id ?? null,
    })
    res.status(200).json({ success: true, message: 'Guardian updated successfully', data })
  } catch (err) {
    sendError(res, err, 'updateResidentGuardian')
  }
}

/** DELETE /residents/:residentId/guardians/:id */
export async function deleteResidentGuardian(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    await deleteGuardian({
      residentId: String(req.params.residentId),
      id: String(req.params.id),
      userId: req.user?.id ?? null,
    })
    res.status(200).json({ success: true, message: 'Guardian removed successfully' })
  } catch (err) {
    sendError(res, err, 'deleteResidentGuardian')
  }
}
