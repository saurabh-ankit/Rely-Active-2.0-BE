import type { Response } from 'express'
import { FeedbackRecipientStatus } from '../../../enums/feedback.enum.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { HttpError } from '../../../middlewares/error/http-error.js'
import {
  getRespondentForm,
  listActiveAdvertisements,
  listRespondentForms,
  submitRespondentForm,
  type FeedbackRespondent,
} from '../../../services/feedback.service.js'

function sendError(res: Response, err: unknown, logLabel: string): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, message: err.message })
    return
  }
  console.error(logLabel, err)
  res.status(500).json({ success: false, message: err instanceof Error ? err.message : 'Unknown error' })
}

/** Family members answer on behalf of the resident they belong to. */
function getResident(req: AuthenticatedRequest): FeedbackRespondent {
  const residentId = req.user?.residentId
  if (!residentId) throw new HttpError(403, 'This is only available to residents')
  return { residentId }
}

/** GET /api/v1/mobile/l1/advertisements — active ads at the resident's property. */
export async function getResidentAdvertisements(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.locationId) throw new HttpError(400, 'Resident is not linked to a property')
    const advertisements = await listActiveAdvertisements(req.locationId)
    res.status(200).json({ success: true, data: advertisements })
  } catch (err) {
    sendError(res, err, 'Get Resident Advertisements Error:')
  }
}

/** GET /api/v1/mobile/l1/feedback-forms?status=PENDING|SUBMITTED */
export async function getResidentFeedbackForms(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const status =
      req.query.status === FeedbackRecipientStatus.SUBMITTED
        ? FeedbackRecipientStatus.SUBMITTED
        : FeedbackRecipientStatus.PENDING
    const forms = await listRespondentForms(getResident(req), status)
    res.status(200).json({ success: true, data: forms })
  } catch (err) {
    sendError(res, err, 'Get Resident Feedback Forms Error:')
  }
}

/** GET /api/v1/mobile/l1/feedback-forms/:id */
export async function getResidentFeedbackForm(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const form = await getRespondentForm(req.params.id as string, getResident(req))
    res.status(200).json({ success: true, data: form })
  } catch (err) {
    sendError(res, err, 'Get Resident Feedback Form Error:')
  }
}

/** POST /api/v1/mobile/l1/feedback-forms/:id/submit  body: { answers: [...] } */
export async function submitResidentFeedbackForm(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    await submitRespondentForm(req.params.id as string, getResident(req), req.body, req.user?.id ?? null)
    res.status(200).json({ success: true, message: 'Thank you! Your feedback has been submitted.' })
  } catch (err) {
    sendError(res, err, 'Submit Resident Feedback Form Error:')
  }
}
