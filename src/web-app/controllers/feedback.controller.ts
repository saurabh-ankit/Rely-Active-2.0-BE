import type { Response } from 'express'
import { Op, type WhereOptions } from 'sequelize'
import sequelize from '../../config/db/index.js'
import {
  FeedbackAnswer,
  FeedbackForm,
  FeedbackFormRecipient,
  FeedbackQuestion,
  Resident,
  User,
  UserDetail,
} from '../../models/index.js'
import type { FeedbackFormAttributes } from '../../models/feedbackForm.model.js'
import {
  FeedbackAnswerType,
  FeedbackAudience,
  FeedbackFormStatus,
  FeedbackRecipientStatus,
  FeedbackRecipientType,
} from '../../enums/feedback.enum.js'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { HttpError } from '../../middlewares/error/http-error.js'
import {
  DEFAULT_RATING_SCALE,
  assertFormEditable,
  buildQuestionRows,
  findAudience,
  isFormExpired,
} from '../../services/feedback.service.js'
import type { SaveFeedbackFormInput } from '../../validations/feedback.validation.js'

function sendError(res: Response, err: unknown, logLabel: string): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, message: err.message })
    return
  }
  console.error(logLabel, err)
  res.status(500).json({ success: false, message: err instanceof Error ? err.message : 'Unknown error' })
}

type RecipientCounts = { recipientCount: number; responseCount: number }

function formatForm(form: FeedbackForm, counts?: RecipientCounts): Record<string, unknown> {
  return {
    id: form.id,
    locationId: form.locationId,
    title: form.title,
    expiryDate: form.expiryDate,
    status: form.status,
    audience: form.audience,
    sentAt: form.sentAt,
    isExpired: isFormExpired(form),
    // Editable until the first response arrives; after that the questions are locked.
    isEditable: (counts?.responseCount ?? 0) === 0,
    createdAt: form.createdAt,
    updatedAt: form.updatedAt,
    ...(form.questions
      ? {
          questions: [...form.questions]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((q) => ({
              id: q.id,
              questionText: q.questionText,
              answerType: q.answerType,
              options: q.options,
              ratingScale: q.ratingScale,
              isRequired: q.isRequired,
              sortOrder: q.sortOrder,
            })),
        }
      : {}),
    ...(counts ?? {}),
  }
}

async function getRecipientCounts(formIds: string[]): Promise<Record<string, RecipientCounts>> {
  if (formIds.length === 0) return {}
  const rows = (await FeedbackFormRecipient.findAll({
    attributes: [
      'formId',
      [sequelize.fn('COUNT', sequelize.col('id')), 'recipientCount'],
      [
        sequelize.fn(
          'SUM',
          sequelize.literal(`CASE WHEN status = '${FeedbackRecipientStatus.SUBMITTED}' THEN 1 ELSE 0 END`),
        ),
        'responseCount',
      ],
    ],
    where: { formId: { [Op.in]: formIds } },
    group: ['formId'],
    raw: true,
  })) as unknown as Array<{ formId: string; recipientCount: number | string; responseCount: number | string }>

  return Object.fromEntries(
    rows.map((r) => [r.formId, { recipientCount: Number(r.recipientCount), responseCount: Number(r.responseCount) }]),
  )
}

async function findForm(locationId: string, id: string, withQuestions = false): Promise<FeedbackForm> {
  const form = await FeedbackForm.findOne({
    where: { id, locationId, isDeleted: false },
    ...(withQuestions ? { include: [{ model: FeedbackQuestion, as: 'questions' }] } : {}),
  })
  if (!form) throw new HttpError(404, 'Feedback form not found')
  return form
}

/**
 * GET /api/v1/location/:locationId/feedback-forms
 * Query: search, status (DRAFT|SENT|EXPIRED), page, limit
 */
export async function getFeedbackForms(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const locationId = req.params.locationId as string
    const { search, status, page = '1', limit = '20' } = req.query as Record<string, string | undefined>

    const filters: WhereOptions<FeedbackFormAttributes>[] = [{ locationId, isDeleted: false }]
    if (search && search.trim()) filters.push({ title: { [Op.like]: `%${search.trim()}%` } })
    if (status === FeedbackFormStatus.DRAFT) filters.push({ status: FeedbackFormStatus.DRAFT })
    if (status === FeedbackFormStatus.SENT) {
      filters.push({ status: FeedbackFormStatus.SENT, expiryDate: { [Op.gt]: new Date() } })
    }
    if (status === 'EXPIRED') filters.push({ expiryDate: { [Op.lte]: new Date() } })

    const limitNum = Math.max(1, parseInt(String(limit)) || 20)
    const pageNum = Math.max(1, parseInt(String(page)) || 1)

    const { rows, count } = await FeedbackForm.findAndCountAll({
      where: { [Op.and]: filters },
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset: (pageNum - 1) * limitNum,
    })
    const counts = await getRecipientCounts(rows.map((f) => f.id))

    res.status(200).json({
      success: true,
      data: {
        forms: rows.map((f) => formatForm(f, counts[f.id] ?? { recipientCount: 0, responseCount: 0 })),
        pagination: { page: pageNum, limit: limitNum, total: count, totalPages: Math.ceil(count / limitNum) },
      },
    })
  } catch (err) {
    sendError(res, err, 'Get Feedback Forms Error:')
  }
}

/** GET /api/v1/location/:locationId/feedback-forms/recipient-count — audience sizes for the send dialog. */
export async function getFeedbackRecipientCount(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const locationId = req.params.locationId as string
    const { residentIds, userIds } = await findAudience(locationId, FeedbackAudience.BOTH)
    res.status(200).json({ success: true, data: { residents: residentIds.length, employees: userIds.length } })
  } catch (err) {
    sendError(res, err, 'Get Feedback Recipient Count Error:')
  }
}

/** GET /api/v1/location/:locationId/feedback-forms/:id */
export async function getFeedbackFormById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const form = await findForm(req.params.locationId as string, req.params.id as string, true)
    const counts = await getRecipientCounts([form.id])
    res.status(200).json({
      success: true,
      data: formatForm(form, counts[form.id] ?? { recipientCount: 0, responseCount: 0 }),
    })
  } catch (err) {
    sendError(res, err, 'Get Feedback Form Error:')
  }
}

/** POST /api/v1/location/:locationId/feedback-forms — creates a DRAFT form with its questions. */
export async function createFeedbackForm(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const locationId = req.params.locationId as string
    const body = req.body as SaveFeedbackFormInput
    const actorId = req.user?.id ?? null

    const formId = await sequelize.transaction(async (transaction) => {
      const form = await FeedbackForm.create(
        { locationId, title: body.title, expiryDate: body.expiryDate, createdBy: actorId, updatedBy: actorId },
        { transaction },
      )
      await FeedbackQuestion.bulkCreate(buildQuestionRows(form.id, body.questions, actorId), { transaction })
      return form.id
    })

    const form = await findForm(locationId, formId, true)
    res.status(201).json({ success: true, message: 'Feedback form created successfully', data: formatForm(form) })
  } catch (err) {
    sendError(res, err, 'Create Feedback Form Error:')
  }
}

/** PUT /api/v1/location/:locationId/feedback-forms/:id — allowed until the form has its first response. */
export async function updateFeedbackForm(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const locationId = req.params.locationId as string
    const id = req.params.id as string
    const body = req.body as SaveFeedbackFormInput
    const actorId = req.user?.id ?? null

    await sequelize.transaction(async (transaction) => {
      // Lock the row so a concurrent send or submission cannot slip in between the check and the write.
      const form = await FeedbackForm.findOne({
        where: { id, locationId, isDeleted: false },
        transaction,
        lock: transaction.LOCK.UPDATE,
      })
      if (!form) throw new HttpError(404, 'Feedback form not found')
      await assertFormEditable(form, transaction)

      await form.update({ title: body.title, expiryDate: body.expiryDate, updatedBy: actorId }, { transaction })
      // No one has answered yet, so the questions can simply be replaced.
      await FeedbackQuestion.destroy({ where: { formId: id }, transaction })
      await FeedbackQuestion.bulkCreate(buildQuestionRows(id, body.questions, actorId), { transaction })
    })

    const form = await findForm(locationId, id, true)
    res.status(200).json({ success: true, message: 'Feedback form updated successfully', data: formatForm(form) })
  } catch (err) {
    sendError(res, err, 'Update Feedback Form Error:')
  }
}

/** DELETE /api/v1/location/:locationId/feedback-forms/:id (soft delete; also hides it from recipients) */
export async function deleteFeedbackForm(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const form = await findForm(req.params.locationId as string, req.params.id as string)
    await form.update({ isDeleted: true, updatedBy: req.user?.id ?? null })
    res.status(200).json({ success: true, message: 'Feedback form deleted successfully' })
  } catch (err) {
    sendError(res, err, 'Delete Feedback Form Error:')
  }
}

/**
 * POST /api/v1/location/:locationId/feedback-forms/:id/send  body: { audience }
 * Records every active resident and/or employee at the property as a recipient and locks the form.
 */
export async function sendFeedbackForm(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const locationId = req.params.locationId as string
    const id = req.params.id as string
    const audience = req.body.audience as FeedbackAudience
    const actorId = req.user?.id ?? null

    const recipientCount = await sequelize.transaction(async (transaction) => {
      const form = await FeedbackForm.findOne({
        where: { id, locationId, isDeleted: false },
        transaction,
        lock: transaction.LOCK.UPDATE,
      })
      if (!form) throw new HttpError(404, 'Feedback form not found')
      if (form.status === FeedbackFormStatus.SENT) throw new HttpError(409, 'This form has already been sent')
      if (isFormExpired(form)) throw new HttpError(400, 'This form has expired. Update the expiry date before sending.')

      const { residentIds, userIds } = await findAudience(locationId, audience, transaction)
      const rows = [
        ...residentIds.map((residentId) => ({ formId: id, recipientType: FeedbackRecipientType.RESIDENT, residentId })),
        ...userIds.map((userId) => ({ formId: id, recipientType: FeedbackRecipientType.EMPLOYEE, userId })),
      ].map((row) => ({ ...row, createdBy: actorId, updatedBy: actorId }))

      if (rows.length === 0) {
        throw new HttpError(400, 'There is no one to send this form to at this property')
      }

      await FeedbackFormRecipient.bulkCreate(rows, { transaction })
      await form.update(
        { status: FeedbackFormStatus.SENT, audience, sentAt: new Date(), updatedBy: actorId },
        { transaction },
      )
      return rows.length
    })

    res.status(200).json({
      success: true,
      message: `Form sent to ${recipientCount} ${recipientCount === 1 ? 'person' : 'people'}`,
      data: { recipientCount },
    })
  } catch (err) {
    sendError(res, err, 'Send Feedback Form Error:')
  }
}

function recipientName(recipient: FeedbackFormRecipient): string {
  if (recipient.resident) {
    return [recipient.resident.firstName, recipient.resident.lastName].filter(Boolean).join(' ')
  }
  const user = recipient.user
  if (!user) return 'Unknown'
  const profile = user.profile
  const fullName = profile ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') : ''
  return fullName || user.username || user.email || 'Unknown'
}

/**
 * GET /api/v1/location/:locationId/feedback-forms/:id/responses
 * Per-question summary (option counts, rating average, paragraph answers) plus each submission.
 */
export async function getFeedbackFormResponses(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const form = await findForm(req.params.locationId as string, req.params.id as string, true)
    const questions = [...(form.questions ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)

    const recipients = await FeedbackFormRecipient.findAll({
      where: { formId: form.id },
      include: [
        { model: Resident, as: 'resident', attributes: ['id', 'firstName', 'lastName'] },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'email'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
        },
        { model: FeedbackAnswer, as: 'answers' },
      ],
      order: [['submittedAt', 'DESC']],
    })

    const submitted = recipients.filter((r) => r.status === FeedbackRecipientStatus.SUBMITTED)
    const allAnswers = submitted.flatMap((r) => (r.answers ?? []).map((a) => ({ answer: a, recipient: r })))

    const summary = questions.map((q) => {
      const answers = allAnswers.filter((a) => a.answer.questionId === q.id)
      const base = {
        questionId: q.id,
        questionText: q.questionText,
        answerType: q.answerType,
        answeredCount: answers.length,
      }

      if (q.answerType === FeedbackAnswerType.PARAGRAPH) {
        return {
          ...base,
          textAnswers: answers.map((a) => ({
            respondentName: recipientName(a.recipient),
            answerText: a.answer.answerText,
          })),
        }
      }
      if (q.answerType === FeedbackAnswerType.RATING) {
        const scale = q.ratingScale ?? DEFAULT_RATING_SCALE
        const values = answers.map((a) => a.answer.ratingValue ?? 0)
        const average = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null
        return {
          ...base,
          ratingScale: scale,
          averageRating: average === null ? null : Math.round(average * 10) / 10,
          distribution: Array.from({ length: scale }, (_, i) => ({
            value: i + 1,
            count: values.filter((v) => v === i + 1).length,
          })),
        }
      }
      return {
        ...base,
        optionCounts: (q.options ?? []).map((option) => ({
          option,
          count: answers.filter((a) => a.answer.selectedOptions?.includes(option)).length,
        })),
      }
    })

    res.status(200).json({
      success: true,
      data: {
        form: formatForm(form, { recipientCount: recipients.length, responseCount: submitted.length }),
        summary,
        responses: submitted.map((r) => ({
          recipientId: r.id,
          recipientType: r.recipientType,
          respondentName: recipientName(r),
          submittedAt: r.submittedAt,
          answers: (r.answers ?? []).map((a) => ({
            questionId: a.questionId,
            answerText: a.answerText,
            selectedOptions: a.selectedOptions,
            ratingValue: a.ratingValue,
          })),
        })),
      },
    })
  } catch (err) {
    sendError(res, err, 'Get Feedback Form Responses Error:')
  }
}
