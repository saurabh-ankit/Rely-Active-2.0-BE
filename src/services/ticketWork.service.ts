/**
 * Work details a ticket's assignee records while doing the job (photos, voice notes,
 * invoice amount). Shared by the L3 staff app and the web admin, so both save the
 * same shape into `ticket.attachments.workDetails`.
 */
import type { Request } from 'express'
import type { Transaction } from 'sequelize'
import { Ticket, TicketActivityLog } from '../models/index.js'
import { TicketActivityType } from '../enums/ticket.enum.js'
import { HttpError } from '../middlewares/error/http-error.js'
import { uploadFileToS3 } from '../middlewares/s3/index.js'

/** Who is recording the work: the L3 staff member, or an admin on the web. */
export interface WorkActor {
  userId: string
  staffName: string
}

export interface WorkDetailFile {
  url: string
  key: string
  contentType: string
  size: number
  uploadedAt: string
  uploadedByUserId: string
  uploadedByName: string
}

export interface WorkDetails {
  photos: WorkDetailFile[]
  voiceNotes: WorkDetailFile[]
}

export function normalizeAttachments(attachments: Ticket['attachments']): Record<string, unknown> {
  if (!attachments) return {}
  return Array.isArray(attachments) ? { files: attachments } : { ...attachments }
}

export function getWorkDetails(attachments: Ticket['attachments']): WorkDetails {
  const raw = normalizeAttachments(attachments).workDetails as Partial<WorkDetails> | undefined
  return {
    photos: Array.isArray(raw?.photos) ? raw.photos : [],
    voiceNotes: Array.isArray(raw?.voiceNotes) ? raw.voiceNotes : [],
  }
}

export function toAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i
const AUDIO_EXTENSIONS = /\.(m4a|aac|mp3|wav|ogg|oga|opus|3gp|amr|webm|caf)$/i

export function isImageFile(file: Express.Multer.File): boolean {
  return file.mimetype.startsWith('image/') || IMAGE_EXTENSIONS.test(file.originalname || '')
}

export function isAudioFile(file: Express.Multer.File): boolean {
  return file.mimetype.startsWith('audio/') || AUDIO_EXTENSIONS.test(file.originalname || '')
}

export async function uploadWorkFiles(
  files: Express.Multer.File[],
  folder: string,
  actor: WorkActor,
): Promise<WorkDetailFile[]> {
  const uploaded: WorkDetailFile[] = []
  for (const file of files) {
    const result = await uploadFileToS3(file, folder)
    uploaded.push({
      url: result.location,
      key: result.key,
      contentType: result.contentType,
      size: result.size,
      uploadedAt: new Date().toISOString(),
      uploadedByUserId: actor.userId,
      uploadedByName: actor.staffName,
    })
  }
  return uploaded
}

export interface WorkDetailsInput {
  invoiceAmount?: number | undefined
  photos: WorkDetailFile[]
  voiceNotes: WorkDetailFile[]
}

/** Reads and validates the `photos` / `voiceNotes` multipart files. */
export function getWorkDetailFiles(req: Request) {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined
  const photoFiles = files?.photos || []
  const voiceNoteFiles = files?.voiceNotes || []

  const invalidPhoto = photoFiles.find((f) => !isImageFile(f))
  if (invalidPhoto) {
    throw new HttpError(400, `"${invalidPhoto.originalname}" is not a supported image file`)
  }
  const invalidVoiceNote = voiceNoteFiles.find((f) => !isAudioFile(f))
  if (invalidVoiceNote) {
    throw new HttpError(400, `"${invalidVoiceNote.originalname}" is not a supported audio file`)
  }
  return { photoFiles, voiceNoteFiles }
}

/** Applies invoice amount and appends files to the locked ticket, logging what changed. Does not save. */
export async function applyWorkDetails(
  t: Ticket,
  actor: WorkActor,
  input: WorkDetailsInput,
  transaction: Transaction,
): Promise<void> {
  const { invoiceAmount, photos, voiceNotes } = input
  if (invoiceAmount === undefined && photos.length === 0 && voiceNotes.length === 0) return

  const previousInvoiceAmount = toAmount(t.invoiceAmount)
  // Build new arrays instead of pushing onto the stored ones: mutating them in
  // place also changes Sequelize's previous value, so the JSON column looks
  // unchanged and every upload after the first was silently not saved.
  const existing = getWorkDetails(t.attachments)
  const workDetails: WorkDetails = {
    photos: [...existing.photos, ...photos],
    voiceNotes: [...existing.voiceNotes, ...voiceNotes],
  }

  t.attachments = { ...normalizeAttachments(t.attachments), workDetails }
  t.changed('attachments', true)
  if (invoiceAmount !== undefined) {
    t.invoiceAmount = invoiceAmount
  }

  const changes: string[] = []
  if (invoiceAmount !== undefined) {
    // First invoice: just the amount; a change: previous → new.
    changes.push(
      previousInvoiceAmount === null
        ? `invoice amount ${invoiceAmount}`
        : `invoice amount ${previousInvoiceAmount} → ${invoiceAmount}`,
    )
  }
  if (photos.length) changes.push(`${photos.length} photo(s)`)
  if (voiceNotes.length) changes.push(`${voiceNotes.length} voice note(s)`)

  await TicketActivityLog.create(
    {
      ticketId: t.id,
      performedByUserId: actor.userId,
      performedByName: actor.staffName,
      activityType:
        photos.length || voiceNotes.length ? TicketActivityType.ATTACHMENT_ADDED : TicketActivityType.UPDATED,
      comment: `Work details added: ${changes.join(', ')}`,
      attachments: {
        ...(invoiceAmount !== undefined ? { previousInvoiceAmount, invoiceAmount } : {}),
        photos,
        voiceNotes,
      },
      createdBy: actor.userId,
    },
    { transaction },
  )
}
