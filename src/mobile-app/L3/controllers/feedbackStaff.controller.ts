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

function getEmployee(req: AuthenticatedRequest): FeedbackRespondent {
  if (!req.user?.id || req.user.residentId) {
    throw new HttpError(403, 'This is only available to employees')
  }
  return { userId: req.user.id }
}

/** GET /api/v1/mobile/l3/advertisements — active ads at the employee's current property. */
export async function getStaffAdvertisements(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    getEmployee(req)
    if (!req.locationId) throw new HttpError(400, 'Employee is not linked to a property')
    const advertisements = await listActiveAdvertisements(req.locationId)
    res.status(200).json({ success: true, data: advertisements })
  } catch (err) {
    sendError(res, err, 'Get Staff Advertisements Error:')
  }
}

/** GET /api/v1/mobile/l3/feedback-forms?status=PENDING|SUBMITTED */
export async function getStaffFeedbackForms(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const status =
      req.query.status === FeedbackRecipientStatus.SUBMITTED
        ? FeedbackRecipientStatus.SUBMITTED
        : FeedbackRecipientStatus.PENDING
    const forms = await listRespondentForms(getEmployee(req), status)
    res.status(200).json({ success: true, data: forms })
  } catch (err) {
    sendError(res, err, 'Get Staff Feedback Forms Error:')
  }
}

/** GET /api/v1/mobile/l3/feedback-forms/:id */
export async function getStaffFeedbackForm(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const form = await getRespondentForm(req.params.id as string, getEmployee(req))
    res.status(200).json({ success: true, data: form })
  } catch (err) {
    sendError(res, err, 'Get Staff Feedback Form Error:')
  }
}

/** POST /api/v1/mobile/l3/feedback-forms/:id/submit  body: { answers: [...] } */
export async function submitStaffFeedbackForm(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    await submitRespondentForm(req.params.id as string, getEmployee(req), req.body, req.user?.id ?? null)
    res.status(200).json({ success: true, message: 'Thank you! Your feedback has been submitted.' })
  } catch (err) {
    sendError(res, err, 'Submit Staff Feedback Form Error:')
  }
}
