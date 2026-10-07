import { Op, type Transaction } from 'sequelize'
import sequelize from '../config/db/index.js'
import {
  Advertisement,
  FeedbackAnswer,
  FeedbackForm,
  FeedbackFormRecipient,
  FeedbackQuestion,
  Resident,
  User,
  UserLocation,
} from '../models/index.js'
import {
  FeedbackAnswerType,
  FeedbackAudience,
  FeedbackFormStatus,
  FeedbackRecipientStatus,
} from '../enums/feedback.enum.js'
import { ResidentStatus } from '../enums/resident.enum.js'
import { HttpError } from '../middlewares/error/http-error.js'
import type { SaveFeedbackFormInput, SubmitFeedbackInput } from '../validations/feedback.validation.js'

export const DEFAULT_RATING_SCALE = 5

export const FORM_LOCKED_MESSAGE = 'This form already has responses and can no longer be edited.'

/** Whoever is answering: a resident (L1 app) or an employee (L3 app). */
export type FeedbackRespondent = { residentId: string } | { userId: string }

export const isFormExpired = (form: Pick<FeedbackForm, 'expiryDate'>): boolean =>
  new Date(form.expiryDate).getTime() <= Date.now()

/** Builds question rows, dropping fields that do not apply to the answer type. */
export function buildQuestionRows(
  formId: string,
  questions: SaveFeedbackFormInput['questions'],
  actorId: string | null,
) {
  return questions.map((q, index) => {
    const isChoice =
      q.answerType === FeedbackAnswerType.SINGLE_CHOICE || q.answerType === FeedbackAnswerType.MULTIPLE_CHOICE
    return {
      formId,
      questionText: q.questionText,
      answerType: q.answerType,
      options: isChoice ? (q.options ?? []) : null,
      ratingScale: q.answerType === FeedbackAnswerType.RATING ? (q.ratingScale ?? DEFAULT_RATING_SCALE) : null,
      isRequired: q.isRequired ?? true,
      sortOrder: index,
      createdBy: actorId,
      updatedBy: actorId,
    }
  })
}

/**
 * Throws 409 once anyone has responded, so every answer matches the questions it was given.
 * Call inside a transaction that holds a lock on the form row; submissions take the same lock.
 */
export async function assertFormEditable(form: FeedbackForm, transaction: Transaction): Promise<void> {
  const responses = await FeedbackFormRecipient.count({
    where: { formId: form.id, status: FeedbackRecipientStatus.SUBMITTED },
    transaction,
  })
  if (responses > 0) throw new HttpError(409, FORM_LOCKED_MESSAGE)
}

/** Active residents and/or employees at a property who would receive a form sent to `audience`. */
export async function findAudience(
  locationId: string,
  audience: FeedbackAudience,
  transaction: Transaction | null = null,
): Promise<{ residentIds: string[]; userIds: string[] }> {
  const wantResidents = audience === FeedbackAudience.RESIDENTS || audience === FeedbackAudience.BOTH
  const wantEmployees = audience === FeedbackAudience.EMPLOYEES || audience === FeedbackAudience.BOTH

  const residentIds = wantResidents
    ? (
        await Resident.findAll({
          attributes: ['id'],
          where: { locId: locationId, status: ResidentStatus.ACTIVE, isDeleted: false },
          transaction,
        })
      ).map((r) => r.id)
    : []

  const userIds = wantEmployees
    ? [
        ...new Set(
          (
            await UserLocation.findAll({
              attributes: ['userId'],
              where: { locId: locationId, isActive: true, isDeleted: false },
              include: [
                {
                  model: User,
                  as: 'user',
                  attributes: [],
                  required: true,
                  where: { isActive: true, isDeleted: false },
                },
              ],
              transaction,
            })
          ).map((ul) => ul.userId),
        ),
      ]
    : []

  return { residentIds, userIds }
}

// ── Recipient side (resident / employee mobile apps) ─────────────────────────

/** Active advertisements at a property, newest first. */
export async function listActiveAdvertisements(locationId: string) {
  return Advertisement.findAll({
    where: { locationId, isActive: true, isDeleted: false },
    attributes: ['id', 'title', 'description', 'imageUrl', 'createdAt'],
    order: [['createdAt', 'DESC']],
  })
}

function respondentWhere(respondent: FeedbackRespondent) {
  return 'residentId' in respondent ? { residentId: respondent.residentId } : { userId: respondent.userId }
}

const liveFormWhere = { status: FeedbackFormStatus.SENT, isDeleted: false }

/**
 * Forms sent to this person. `PENDING` (default) returns unanswered forms that have not
 * expired; `SUBMITTED` returns the ones already answered.
 */
export async function listRespondentForms(
  respondent: FeedbackRespondent,
  status: FeedbackRecipientStatus = FeedbackRecipientStatus.PENDING,
) {
  const recipients = await FeedbackFormRecipient.findAll({
    where: { ...respondentWhere(respondent), status },
    include: [
      {
        model: FeedbackForm,
        as: 'form',
        required: true,
        where: {
          ...liveFormWhere,
          ...(status === FeedbackRecipientStatus.PENDING ? { expiryDate: { [Op.gt]: new Date() } } : {}),
        },
        include: [{ model: FeedbackQuestion, as: 'questions', attributes: ['id'] }],
      },
    ],
    order: [[{ model: FeedbackForm, as: 'form' }, 'expiryDate', 'ASC']],
  })

  return recipients.map((r) => ({
    formId: r.formId,
    title: r.form!.title,
    expiryDate: r.form!.expiryDate,
    sentAt: r.form!.sentAt,
    questionCount: r.form!.questions?.length ?? 0,
    status: r.status,
    submittedAt: r.submittedAt,
  }))
}

async function findRespondentRecipient(
  formId: string,
  respondent: FeedbackRespondent,
  transaction: Transaction | null = null,
): Promise<FeedbackFormRecipient> {
  const recipient = await FeedbackFormRecipient.findOne({
    where: { formId, ...respondentWhere(respondent) },
    include: [{ model: FeedbackForm, as: 'form', required: true, where: liveFormWhere }],
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  })
  if (!recipient) throw new HttpError(404, 'Feedback form not found')
  return recipient
}

/** The form with its questions, plus this person's answers if they already submitted. */
export async function getRespondentForm(formId: string, respondent: FeedbackRespondent) {
  const recipient = await findRespondentRecipient(formId, respondent)
  const form = recipient.form!

  const [questions, answers] = await Promise.all([
    FeedbackQuestion.findAll({ where: { formId }, order: [['sortOrder', 'ASC']] }),
    recipient.status === FeedbackRecipientStatus.SUBMITTED
      ? FeedbackAnswer.findAll({ where: { recipientId: recipient.id } })
      : Promise.resolve([] as FeedbackAnswer[]),
  ])

  return {
    formId: form.id,
    title: form.title,
    expiryDate: form.expiryDate,
    isExpired: isFormExpired(form),
    status: recipient.status,
    submittedAt: recipient.submittedAt,
    questions: questions.map((q) => ({
      id: q.id,
      questionText: q.questionText,
      answerType: q.answerType,
      options: q.options,
      ratingScale: q.ratingScale,
      isRequired: q.isRequired,
    })),
    answers: answers.map((a) => ({
      questionId: a.questionId,
      answerText: a.answerText,
      selectedOptions: a.selectedOptions,
      ratingValue: a.ratingValue,
    })),
  }
}

type AnswerInput = SubmitFeedbackInput['answers'][number]

/** Checks one answer against its question and returns the value columns to store, or null if left blank. */
function toAnswerValues(question: FeedbackQuestion, answer: AnswerInput | undefined) {
  const label = `"${question.questionText}"`
  const missing = () => {
    if (question.isRequired) throw new HttpError(400, `An answer is required for ${label}`)
    return null
  }

  switch (question.answerType) {
    case FeedbackAnswerType.PARAGRAPH: {
      const text = answer?.answerText?.trim()
      if (!text) return missing()
      return { answerText: text, selectedOptions: null, ratingValue: null }
    }
    case FeedbackAnswerType.SINGLE_CHOICE:
    case FeedbackAnswerType.MULTIPLE_CHOICE: {
      const selected = [...new Set(answer?.selectedOptions ?? [])]
      if (selected.length === 0) return missing()
      if (question.answerType === FeedbackAnswerType.SINGLE_CHOICE && selected.length > 1) {
        throw new HttpError(400, `Choose only one option for ${label}`)
      }
      const options = question.options ?? []
      if (selected.some((s) => !options.includes(s))) {
        throw new HttpError(400, `Invalid option selected for ${label}`)
      }
      return { answerText: null, selectedOptions: selected, ratingValue: null }
    }
    case FeedbackAnswerType.RATING: {
      const value = answer?.ratingValue
      if (value === undefined || value === null) return missing()
      const scale = question.ratingScale ?? DEFAULT_RATING_SCALE
      if (value < 1 || value > scale) {
        throw new HttpError(400, `Rating for ${label} must be between 1 and ${scale}`)
      }
      return { answerText: null, selectedOptions: null, ratingValue: value }
    }
    default:
      return null
  }
}

/** Saves a person's answers. A form can be submitted once, and only before it expires. */
export async function submitRespondentForm(
  formId: string,
  respondent: FeedbackRespondent,
  input: SubmitFeedbackInput,
  actorId: string | null,
): Promise<void> {
  await sequelize.transaction(async (transaction) => {
    const recipient = await findRespondentRecipient(formId, respondent, transaction)
    if (recipient.status === FeedbackRecipientStatus.SUBMITTED) {
      throw new HttpError(409, 'You have already submitted this feedback form')
    }
    if (isFormExpired(recipient.form!)) {
      throw new HttpError(400, 'This feedback form has expired')
    }

    const questions = await FeedbackQuestion.findAll({ where: { formId }, transaction })
    const questionIds = new Set(questions.map((q) => q.id))
    const unknown = input.answers.find((a) => !questionIds.has(a.questionId))
    if (unknown) throw new HttpError(409, 'This form has been updated. Please reopen it and try again.')

    const answersByQuestion = new Map(input.answers.map((a) => [a.questionId, a]))
    const rows = questions.flatMap((q) => {
      const values = toAnswerValues(q, answersByQuestion.get(q.id))
      return values
        ? [{ recipientId: recipient.id, questionId: q.id, ...values, createdBy: actorId, updatedBy: actorId }]
        : []
    })

    await FeedbackAnswer.bulkCreate(rows, { transaction })
    await recipient.update(
      { status: FeedbackRecipientStatus.SUBMITTED, submittedAt: new Date(), updatedBy: actorId },
      { transaction },
    )
  })
}
