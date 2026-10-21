import { randomUUID } from 'node:crypto'
import { HttpError } from '../middlewares/error/http-error.js'
import { uploadFileToS3 } from '../middlewares/s3/index.js'
import { ResidentIncident } from '../models/index.js'
import type { ConsultantFileEntry, ConsultantFileType } from '../models/consultant.model.js'
import type {
  CreateResidentIncidentInput,
  UpdateResidentIncidentInput,
} from '../validations/residentIncident.validation.js'
import { getSopSummaries, type IncidentSopSummary } from './incidentSop.service.js'
import { getClinicalResident } from './residentClinical.service.js'
import { userInclude, userName } from './residentCondition.service.js'

async function uploadIncidentFiles(
  files: Express.Multer.File[],
  folder: string,
  userId: string | null,
  fileType: ConsultantFileType,
): Promise<ConsultantFileEntry[]> {
  const uploaded: ConsultantFileEntry[] = []
  for (const file of files) {
    const result = await uploadFileToS3(file, folder)
    uploaded.push({
      id: randomUUID(),
      url: result.location,
      key: result.key,
      name: file.originalname || result.key.split('/').pop() || 'file',
      contentType: result.contentType,
      size: result.size,
      fileType,
      uploadedAt: new Date().toISOString(),
      uploadedByUserId: userId ?? '',
    })
  }
  return uploaded
}

function fileList(value: unknown): ConsultantFileEntry[] {
  if (Array.isArray(value)) return value as ConsultantFileEntry[]
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      return Array.isArray(parsed) ? (parsed as ConsultantFileEntry[]) : []
    } catch {
      return []
    }
  }
  return []
}

export function formatIncident(row: ResidentIncident, sop: IncidentSopSummary | null = null) {
  return {
    id: row.id,
    incidentType: row.incidentType,
    severity: row.severity,
    incidentAt: new Date(row.incidentAt).toISOString(),
    notes: row.notes ?? null,
    photos: fileList(row.photos),
    voiceNotes: fileList(row.voiceNotes),
    reportedByName: userName(row.creator),
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    sop,
  }
}

async function formatWithSop(rows: ResidentIncident[]) {
  const summaries = await getSopSummaries(rows)
  return rows.map((row) => formatIncident(row, summaries.get(row.id) ?? null))
}

export async function createResidentIncident(params: {
  residentId: string
  input: CreateResidentIncidentInput
  userId: string | null
  files: { photos: Express.Multer.File[]; voiceNotes: Express.Multer.File[] }
}) {
  const { residentId, input, userId, files } = params
  const resident = await getClinicalResident(residentId)
  const folder = `resident-incidents/${residentId}`

  const [photos, voiceNotes] = await Promise.all([
    uploadIncidentFiles(files.photos, folder, userId, 'IMAGE'),
    uploadIncidentFiles(files.voiceNotes, folder, userId, 'AUDIO'),
  ])

  const created = await ResidentIncident.create({
    residentId,
    locationId: resident.locId,
    incidentType: input.incidentType,
    severity: input.severity,
    incidentAt: new Date(input.incidentAt),
    notes: input.notes ?? null,
    photos,
    voiceNotes,
    isDeleted: false,
    createdBy: userId,
    updatedBy: userId,
  })

  const row = await ResidentIncident.findByPk(created.id, { include: [userInclude('creator')] })
  const [formatted] = await formatWithSop([row ?? created])
  return formatted
}

/** The resident's incidents, newest first. */
export async function listResidentIncidents(residentId: string) {
  await getClinicalResident(residentId)
  const rows = await ResidentIncident.findAll({
    where: { residentId, isDeleted: false },
    include: [userInclude('creator')],
    order: [
      ['incidentAt', 'DESC'],
      ['createdAt', 'DESC'],
    ],
  })
  return formatWithSop(rows)
}

async function findResidentIncident(residentId: string, id: string) {
  const row = await ResidentIncident.findOne({
    where: { id, residentId, isDeleted: false },
    include: [userInclude('creator')],
  })
  if (!row) {
    throw new HttpError(404, 'Incident not found')
  }
  return row
}

export async function updateResidentIncident(params: {
  residentId: string
  id: string
  input: UpdateResidentIncidentInput
  userId: string | null
  files?: { photos: Express.Multer.File[]; voiceNotes: Express.Multer.File[] }
}) {
  const { residentId, id, input, userId, files } = params
  const row = await findResidentIncident(residentId, id)
  const folder = `resident-incidents/${residentId}`

  const [newPhotos, newVoiceNotes] = await Promise.all([
    uploadIncidentFiles(files?.photos ?? [], folder, userId, 'IMAGE'),
    uploadIncidentFiles(files?.voiceNotes ?? [], folder, userId, 'AUDIO'),
  ])

  const photos = [...fileList(row.photos), ...newPhotos]
  const voiceNotes = [...fileList(row.voiceNotes), ...newVoiceNotes]

  await row.update({
    incidentType: input.incidentType !== undefined ? input.incidentType : row.incidentType,
    severity: input.severity !== undefined ? input.severity : row.severity,
    incidentAt: input.incidentAt !== undefined ? new Date(input.incidentAt) : row.incidentAt,
    notes: input.notes !== undefined ? input.notes : row.notes,
    photos,
    voiceNotes,
    updatedBy: userId,
  })

  const refreshed = await findResidentIncident(residentId, id)
  const [formatted] = await formatWithSop([refreshed])
  return formatted
}

export async function deleteResidentIncident(params: { residentId: string; id: string; userId: string | null }) {
  const { residentId, id, userId } = params
  const row = await findResidentIncident(residentId, id)
  await row.update({ isDeleted: true, updatedBy: userId })
}
