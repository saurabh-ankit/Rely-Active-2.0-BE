import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { HttpError } from '../../middlewares/error/http-error.js'
import {
  createResidentNokContact as createNokContact,
  deleteResidentNokContact as deleteNokContact,
  listResidentNokContacts,
  updateResidentNokContact as updateNokContact,
} from '../../services/residentNokContact.service.js'
import type {
  CreateResidentNokContactInput,
  UpdateResidentNokContactInput,
} from '../../validations/residentNokContact.validation.js'

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

function nokPhoto(req: AuthenticatedRequest): { photo?: Express.Multer.File } {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined
  const photo = files?.photo?.[0]
  return photo ? { photo } : {}
}

/**
 * GET /residents/:residentId/nok-contacts
 */
export async function getResidentNokContacts(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await listResidentNokContacts(String(req.params.residentId))
    res.status(200).json({ success: true, message: 'NOK contacts fetched successfully', data })
  } catch (err) {
    sendError(res, err, 'getResidentNokContacts')
  }
}

/**
 * POST /residents/:residentId/nok-contacts (multipart, optional field: photo)
 */
export async function createResidentNokContact(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await createNokContact({
      residentId: String(req.params.residentId),
      input: req.body as CreateResidentNokContactInput,
      ...nokPhoto(req),
      userId: req.user?.id ?? null,
    })
    res.status(201).json({ success: true, message: 'NOK contact added successfully', data })
  } catch (err) {
    sendError(res, err, 'createResidentNokContact')
  }
}

/**
 * PUT /residents/:residentId/nok-contacts/:id (multipart, optional field: photo)
 */
export async function updateResidentNokContact(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await updateNokContact({
      ...itemParams(req),
      input: req.body as UpdateResidentNokContactInput,
      ...nokPhoto(req),
    })
    res.status(200).json({ success: true, message: 'NOK contact updated successfully', data })
  } catch (err) {
    sendError(res, err, 'updateResidentNokContact')
  }
}

/**
 * DELETE /residents/:residentId/nok-contacts/:id (soft)
 */
export async function deleteResidentNokContact(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    await deleteNokContact(itemParams(req))
    res.status(200).json({ success: true, message: 'NOK contact deleted successfully' })
  } catch (err) {
    sendError(res, err, 'deleteResidentNokContact')
  }
}
