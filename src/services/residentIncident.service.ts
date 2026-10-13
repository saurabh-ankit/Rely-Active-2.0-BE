import { randomUUID } from 'node:crypto'
import { uploadFileToS3 } from '../middlewares/s3/index.js'
import { ResidentIncident } from '../models/index.js'
import type { ConsultantFileEntry, ConsultantFileType } from '../models/consultant.model.js'
import type { CreateResidentIncidentInput } from '../validations/residentIncident.validation.js'
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
