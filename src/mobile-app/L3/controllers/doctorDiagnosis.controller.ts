import { randomUUID } from 'node:crypto'
import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import sequelize from '../../../config/db/index.js'
import { AppointmentStatus } from '../../../enums/appointment.enum.js'
import { DiagnosisCondition, DiagnosisStatus } from '../../../enums/diagnosis.enum.js'
import {
  Consultant,
  DoctorAppointment,
  InventoryItem,
  InventoryItemLocation,
  VitalSetting,
} from '../../../models/index.js'
import type {
  ConsultantAllergyEntry,
  ConsultantFileEntry,
  ConsultantFileType,
  ConsultantInsulinEntry,
  ConsultantMedicationEntry,
  ConsultantVitalEntry,
} from '../../../models/consultant.model.js'
import { uploadFileToS3 } from '../../../middlewares/s3/index.js'
import type { MedicationTimeOfDay, MedicationTiming } from '../../../models/residentMedication.model.js'
import { MedicationMealTiming, MedicationRoute } from '../../../enums/medication.enum.js'
import { syncAppointmentMedications } from '../../../services/residentMedication.service.js'
import { syncAppointmentInsulin } from '../../../services/residentInsulin.service.js'
import { syncAppointmentVitals } from '../../../services/residentVital.service.js'
import { syncAppointmentAllergies } from '../../../services/residentAllergy.service.js'
import { getResidentPreviousClinical } from '../../../services/residentClinical.service.js'
import { isAdminOrSuperAdmin } from './medical.controller.js'

const TIME_OF_DAY: MedicationTimeOfDay[] = ['morning', 'afternoon', 'evening', 'night']
const ROUTES = Object.values(MedicationRoute)
const MEAL_TIMINGS = Object.values(MedicationMealTiming)

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

export function formatConsultant(row: Consultant) {
  const data = row.toJSON ? row.toJSON() : row
  return {
    id: data.id,
    appointmentId: data.appointmentId,
    residentId: data.residentId,
    locationId: data.locationId,
    doctorId: data.doctorId,
    allergies: asArray<ConsultantAllergyEntry>(data.allergies),
    vitals: asArray<ConsultantVitalEntry>(data.vitals),
    medications: asArray<ConsultantMedicationEntry>(data.medications),
    insulin: asArray<ConsultantInsulinEntry>(data.insulin),
    note: data.note || null,
    attachments: asArray<ConsultantFileEntry>(data.attachments),
    voiceNotes: asArray<ConsultantFileEntry>(data.voiceNotes),
    condition: data.condition || null,
    status: data.status,
    completedAt: data.completedAt || null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

function emptyDraft(appointment: DoctorAppointment) {
  return {
    id: null,
    appointmentId: appointment.id,
    residentId: appointment.residentId,
    locationId: appointment.locationId,
    doctorId: appointment.doctorId,
    allergies: [] as ConsultantAllergyEntry[],
    vitals: [] as ConsultantVitalEntry[],
    medications: [] as ConsultantMedicationEntry[],
    insulin: [] as ConsultantInsulinEntry[],
    note: null as string | null,
    attachments: [] as ConsultantFileEntry[],
    voiceNotes: [] as ConsultantFileEntry[],
    condition: null as DiagnosisCondition | null,
    status: DiagnosisStatus.DRAFT,
    completedAt: null,
    createdAt: null,
    updatedAt: null,
  }
}

/**
 * Doctor must own the appointment (or be admin).
 */
async function assertAppointmentAccess(
  req: AuthenticatedRequest,
  appointmentId: string,
): Promise<{ ok: true; appointment: DoctorAppointment } | { ok: false; status: number; message: string }> {
  const doctorId = req.user?.id
  if (!doctorId) {
    return { ok: false, status: 401, message: 'Unauthorized' }
  }

  const appointment = await DoctorAppointment.findOne({
    where: { id: appointmentId, isDeleted: false },
  })
  if (!appointment) {
    return { ok: false, status: 404, message: 'Appointment not found' }
  }

  if (await isAdminOrSuperAdmin(req)) {
    return { ok: true, appointment }
  }

  if (String(appointment.doctorId) !== String(doctorId)) {
    return {
      ok: false,
      status: 403,
      message: 'You do not have access to this appointment diagnosis',
    }
  }

  return { ok: true, appointment }
}

const CONDITIONS = Object.values(DiagnosisCondition)

function parseCondition(value: unknown): DiagnosisCondition | null | { error: string } {
  if (value === null || value === '') return null
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (CONDITIONS.includes(normalized as DiagnosisCondition)) return normalized as DiagnosisCondition
  return { error: `condition must be one of ${CONDITIONS.join(', ')}` }
}

function parseRecordedAt(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return new Date().toISOString()
}

function parseDateOnly(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const trimmed = value.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  const d = new Date(`${trimmed}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return null
  return trimmed
}

function parseTimings(value: unknown): MedicationTiming[] | null {
  if (!Array.isArray(value)) return null
  const timings: MedicationTiming[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null
    const item = raw as Record<string, unknown>
    const timeOfDay = String(item.timeOfDay || '') as MedicationTimeOfDay
    if (!TIME_OF_DAY.includes(timeOfDay)) return null
    const route = String(item.route || MedicationRoute.ORAL) as MedicationRoute
    if (!ROUTES.includes(route)) return null
    const mealTiming = String(item.mealTiming || MedicationMealTiming.NONE) as MedicationMealTiming
    if (!MEAL_TIMINGS.includes(mealTiming)) return null
    const dose = Number(item.dose)
    if (!Number.isFinite(dose) || dose < 0) return null
    const time = typeof item.time === 'string' && item.time.trim() ? item.time.trim() : '08:00'
    timings.push({
      timeOfDay,
      selected: Boolean(item.selected),
      time,
      dose,
      route,
      mealTiming,
    })
  }
  return timings
}

function parseAllergies(value: unknown): ConsultantAllergyEntry[] | { error: string } {
  if (!Array.isArray(value)) return { error: 'allergies must be an array' }
  const out: ConsultantAllergyEntry[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return { error: 'Invalid allergy entry' }
    const item = raw as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!name) return { error: 'Allergy name is required' }
    out.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : randomUUID(),
      name,
      note: typeof item.note === 'string' ? item.note.trim() || null : null,
      recordedAt: parseRecordedAt(item.recordedAt),
    })
  }
  return out
}

async function parseVitals(value: unknown): Promise<ConsultantVitalEntry[] | { error: string }> {
  if (!Array.isArray(value)) return { error: 'vitals must be an array' }
  const out: ConsultantVitalEntry[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return { error: 'Invalid vital entry' }
    const item = raw as Record<string, unknown>
    const vitalSettingId = typeof item.vitalSettingId === 'string' ? item.vitalSettingId.trim() : ''
    if (!vitalSettingId) return { error: 'Vital type is required' }

    const setting = await VitalSetting.findOne({
      where: { id: vitalSettingId, isDeleted: false, isActive: true },
    })
    if (!setting) return { error: `Vital setting not found: ${vitalSettingId}` }

    const vitalValue =
      typeof item.value === 'string' ? item.value.trim() : item.value != null ? String(item.value).trim() : ''
    if (!vitalValue) return { error: `Value is required for ${setting.name}` }

    if (setting.inputType === 'single') {
      const num = Number(vitalValue)
      if (!Number.isFinite(num)) {
        return { error: `Enter a valid numeric value for ${setting.name}` }
      }
    } else {
      // composite e.g. BP 120/80
      const compositeOk = /^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/.test(vitalValue)
      const singleNum = Number(vitalValue)
      if (!compositeOk && !Number.isFinite(singleNum)) {
        return {
          error: `Enter a valid value for ${setting.name} (e.g. 120/80)`,
        }
      }
    }

    out.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : randomUUID(),
      vitalSettingId: setting.id,
      name: setting.name,
      unit: setting.unit,
      value: vitalValue,
      note: typeof item.note === 'string' ? item.note.trim() || null : null,
      recordedAt: parseRecordedAt(item.recordedAt),
    })
  }
  return out
}

async function parseMedications(
  value: unknown,
  locationId: string,
  options?: { requiredPackType?: string; fieldLabel?: string },
): Promise<ConsultantMedicationEntry[] | { error: string }> {
  const fieldLabel = options?.fieldLabel || 'medication'
  const requiredPackType = options?.requiredPackType?.toLowerCase()
  if (!Array.isArray(value)) return { error: `${fieldLabel}s must be an array` }
  const out: ConsultantMedicationEntry[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return { error: `Invalid ${fieldLabel} entry` }
    const item = raw as Record<string, unknown>
    const inventoryItemId = typeof item.inventoryItemId === 'string' ? item.inventoryItemId.trim() : ''
    if (!inventoryItemId) return { error: `inventoryItemId is required for each ${fieldLabel}` }

    const startDate = parseDateOnly(item.startDate)
    if (!startDate) return { error: `Valid startDate is required for each ${fieldLabel}` }

    const isUntilDischarge = Boolean(item.isUntilDischarge)
    const endDate = isUntilDischarge ? null : parseDateOnly(item.endDate)
    if (!isUntilDischarge && !endDate) {
      return { error: 'endDate is required when not until discharge' }
    }
    if (endDate && endDate < startDate) {
      return { error: 'endDate must be on or after startDate' }
    }

    const timings = parseTimings(item.timings)
    if (!timings) return { error: `Invalid ${fieldLabel} timings` }
    if (!timings.some((t) => t.selected)) {
      return { error: `Select at least one intake time per ${fieldLabel}` }
    }

    const itemLink = await InventoryItemLocation.findOne({
      where: { locationId, itemId: inventoryItemId },
    })
    const inv = await InventoryItem.findByPk(inventoryItemId)
    if (!itemLink || !inv || !inv.isActive) {
      return { error: `Selected medicine is not available at this location` }
    }
    if (requiredPackType && String(inv.packType || '').toLowerCase() !== requiredPackType) {
      return { error: `Selected item must be packType "${requiredPackType}" for ${fieldLabel}` }
    }

    out.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : randomUUID(),
      inventoryItemId,
      medicineName:
        typeof item.medicineName === 'string' && item.medicineName.trim() ? item.medicineName.trim() : inv.name,
      startDate,
      endDate,
      isUntilDischarge,
      timings,
      note: typeof item.note === 'string' ? item.note.trim() || null : null,
    })
  }
  return out
}

async function parseInsulin(value: unknown, locationId: string): Promise<ConsultantInsulinEntry[] | { error: string }> {
  return parseMedications(value, locationId, {
    requiredPackType: 'vial',
    fieldLabel: 'insulin',
  })
}

/**
 * GET /doctor/appointments/:appointmentId/diagnosis
 */
export async function getAppointmentDiagnosis(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const appointmentId = String(req.params.appointmentId || '').trim()
    if (!appointmentId) {
      res.status(400).json({ success: false, message: 'Appointment ID is required' })
      return
    }

    const access = await assertAppointmentAccess(req, appointmentId)
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message })
      return
    }

    const { appointment } = access
    const [existing, previous] = await Promise.all([
      Consultant.findOne({
        where: { appointmentId, isDeleted: false },
      }),
      getResidentPreviousClinical(appointment.residentId, appointment.id),
    ])

    res.status(200).json({
      success: true,
      message: existing ? 'Diagnosis fetched successfully' : 'Diagnosis draft',
      data: {
        ...(existing ? formatConsultant(existing) : emptyDraft(appointment)),
        previous,
      },
    })
  } catch (err) {
    console.error('Get Appointment Diagnosis Error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch diagnosis' })
  }
}

/**
 * PUT /doctor/appointments/:appointmentId/diagnosis
 * Upsert consultant draft (allergies, vitals, medications, insulin, note).
 */
export async function upsertAppointmentDiagnosis(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const appointmentId = String(req.params.appointmentId || '').trim()
    if (!appointmentId) {
      res.status(400).json({ success: false, message: 'Appointment ID is required' })
      return
    }

    const access = await assertAppointmentAccess(req, appointmentId)
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message })
      return
    }

    const { appointment } = access
    const userId = req.user?.id || null

    let row = await Consultant.findOne({
      where: { appointmentId, isDeleted: false },
    })

    let allergies = row ? asArray<ConsultantAllergyEntry>(row.allergies) : []
    let vitals = row ? asArray<ConsultantVitalEntry>(row.vitals) : []
    let medications = row ? asArray<ConsultantMedicationEntry>(row.medications) : []
    let insulin = row ? asArray<ConsultantInsulinEntry>(row.insulin) : []
    let note = row?.note ?? null
    let condition = row?.condition ?? null

    if (req.body?.allergies !== undefined) {
      const parsed = parseAllergies(req.body.allergies)
      if ('error' in parsed) {
        res.status(400).json({ success: false, message: parsed.error })
        return
      }
      allergies = parsed
    }

    if (req.body?.vitals !== undefined) {
      const parsed = await parseVitals(req.body.vitals)
      if ('error' in parsed) {
        res.status(400).json({ success: false, message: parsed.error })
        return
      }
      vitals = parsed
    }

    if (req.body?.medications !== undefined) {
      const parsed = await parseMedications(req.body.medications, appointment.locationId)
      if ('error' in parsed) {
        res.status(400).json({ success: false, message: parsed.error })
        return
      }
      medications = parsed
    }

    if (req.body?.insulin !== undefined) {
      const parsed = await parseInsulin(req.body.insulin, appointment.locationId)
      if ('error' in parsed) {
        res.status(400).json({ success: false, message: parsed.error })
        return
      }
      insulin = parsed
    }

    if (req.body?.note !== undefined) {
      note = typeof req.body.note === 'string' ? req.body.note.trim() || null : null
    }

    if (req.body?.condition !== undefined) {
      const parsed = parseCondition(req.body.condition)
      if (typeof parsed === 'object' && parsed !== null) {
        res.status(400).json({ success: false, message: parsed.error })
        return
      }
      condition = parsed
    }

    if (!row) {
      row = await Consultant.create({
        appointmentId: appointment.id,
        residentId: appointment.residentId,
        locationId: appointment.locationId,
        doctorId: appointment.doctorId,
        allergies,
        vitals,
        medications,
        insulin,
        note,
        condition,
        status: DiagnosisStatus.DRAFT,
        createdBy: userId,
        updatedBy: userId,
      })
    } else {
      row.allergies = allergies
      row.vitals = vitals
      row.medications = medications
      row.insulin = insulin
      row.note = note
      row.condition = condition
      row.updatedBy = userId
      await row.save()
    }

    // Also persist allergies / medications / insulin / vitals in dedicated tables
    await syncAppointmentAllergies({
      residentId: appointment.residentId,
      locationId: appointment.locationId,
      appointmentId: appointment.id,
      allergies,
      userId,
    })
    await syncAppointmentMedications({
      residentId: appointment.residentId,
      locationId: appointment.locationId,
      appointmentId: appointment.id,
      medications,
      userId,
    })
    await syncAppointmentInsulin({
      residentId: appointment.residentId,
      locationId: appointment.locationId,
      appointmentId: appointment.id,
      insulin,
      userId,
    })
    await syncAppointmentVitals({
      residentId: appointment.residentId,
      locationId: appointment.locationId,
      appointmentId: appointment.id,
      vitals,
      userId,
    })

    res.status(200).json({
      success: true,
      message: 'Diagnosis saved successfully',
      data: formatConsultant(row),
    })
  } catch (err) {
    console.error('Upsert Appointment Diagnosis Error:', err)
    res.status(500).json({ success: false, message: 'Failed to save diagnosis' })
  }
}

/**
 * POST /doctor/appointments/:appointmentId/diagnosis/submit
 */
export async function submitAppointmentDiagnosis(req: AuthenticatedRequest, res: Response): Promise<void> {
  const transaction = await sequelize.transaction()
  try {
    const appointmentId = String(req.params.appointmentId || '').trim()
    if (!appointmentId) {
      await transaction.rollback()
      res.status(400).json({ success: false, message: 'Appointment ID is required' })
      return
    }

    const access = await assertAppointmentAccess(req, appointmentId)
    if (!access.ok) {
      await transaction.rollback()
      res.status(access.status).json({ success: false, message: access.message })
      return
    }

    const { appointment } = access
    const userId = req.user?.id || null

    if (appointment.status === AppointmentStatus.CANCELLED) {
      await transaction.rollback()
      res.status(400).json({
        success: false,
        message: 'Cannot submit diagnosis for a cancelled appointment',
      })
      return
    }

    let consultant = await Consultant.findOne({
      where: { appointmentId, isDeleted: false },
      transaction,
    })

    const alreadyCompleted = consultant?.status === DiagnosisStatus.COMPLETED

    // Allow final payload on submit
    let allergies = consultant ? asArray<ConsultantAllergyEntry>(consultant.allergies) : []
    let vitals = consultant ? asArray<ConsultantVitalEntry>(consultant.vitals) : []
    let medications = consultant ? asArray<ConsultantMedicationEntry>(consultant.medications) : []
    let insulin = consultant ? asArray<ConsultantInsulinEntry>(consultant.insulin) : []
    let note = consultant?.note ?? null
    let condition = consultant?.condition ?? null

    if (req.body?.allergies !== undefined) {
      const parsed = parseAllergies(req.body.allergies)
      if ('error' in parsed) {
        await transaction.rollback()
        res.status(400).json({ success: false, message: parsed.error })
        return
      }
      allergies = parsed
    }
    if (req.body?.vitals !== undefined) {
      const parsed = await parseVitals(req.body.vitals)
      if ('error' in parsed) {
        await transaction.rollback()
        res.status(400).json({ success: false, message: parsed.error })
        return
      }
      vitals = parsed
    }
    if (req.body?.medications !== undefined) {
      const parsed = await parseMedications(req.body.medications, appointment.locationId)
      if ('error' in parsed) {
        await transaction.rollback()
        res.status(400).json({ success: false, message: parsed.error })
        return
      }
      medications = parsed
    }
    if (req.body?.insulin !== undefined) {
      const parsed = await parseInsulin(req.body.insulin, appointment.locationId)
      if ('error' in parsed) {
        await transaction.rollback()
        res.status(400).json({ success: false, message: parsed.error })
        return
      }
      insulin = parsed
    }
    if (req.body?.note !== undefined) {
      note = typeof req.body.note === 'string' ? req.body.note.trim() || null : null
    }
    if (req.body?.condition !== undefined) {
      const parsed = parseCondition(req.body.condition)
      if (typeof parsed === 'object' && parsed !== null) {
        await transaction.rollback()
        res.status(400).json({ success: false, message: parsed.error })
        return
      }
      condition = parsed
    }
    if (!condition) {
      await transaction.rollback()
      res.status(400).json({ success: false, message: 'Please select the resident condition' })
      return
    }

    const now = new Date()
    const completedAt = alreadyCompleted && consultant?.completedAt ? consultant.completedAt : now
    const attendedAt = alreadyCompleted && appointment.attendedAt ? appointment.attendedAt : now

    if (!consultant) {
      consultant = await Consultant.create(
        {
          appointmentId: appointment.id,
          residentId: appointment.residentId,
          locationId: appointment.locationId,
          doctorId: appointment.doctorId,
          allergies,
          vitals,
          medications,
          insulin,
          note,
          condition,
          status: DiagnosisStatus.COMPLETED,
          completedAt: now,
          createdBy: userId,
          updatedBy: userId,
        },
        { transaction },
      )
    } else {
      consultant.allergies = allergies
      consultant.vitals = vitals
      consultant.medications = medications
      consultant.insulin = insulin
      consultant.note = note
      consultant.condition = condition
      consultant.status = DiagnosisStatus.COMPLETED
      consultant.completedAt = completedAt
      consultant.updatedBy = userId
      await consultant.save({ transaction })
    }

    await appointment.update(
      {
        status: AppointmentStatus.ATTENDED,
        attendedAt,
        cancelledAt: null,
        cancellationReason: null,
        updatedBy: userId,
        ...(consultant.note ? { notes: consultant.note } : {}),
      },
      { transaction },
    )

    await syncAppointmentAllergies({
      residentId: appointment.residentId,
      locationId: appointment.locationId,
      appointmentId: appointment.id,
      allergies,
      userId,
      transaction,
    })
    await syncAppointmentMedications({
      residentId: appointment.residentId,
      locationId: appointment.locationId,
      appointmentId: appointment.id,
      medications,
      userId,
      transaction,
    })
    await syncAppointmentInsulin({
      residentId: appointment.residentId,
      locationId: appointment.locationId,
      appointmentId: appointment.id,
      insulin,
      userId,
      transaction,
    })
    await syncAppointmentVitals({
      residentId: appointment.residentId,
      locationId: appointment.locationId,
      appointmentId: appointment.id,
      vitals,
      userId,
      transaction,
    })

    await transaction.commit()

    res.status(200).json({
      success: true,
      message: alreadyCompleted ? 'Diagnosis updated successfully' : 'Diagnosis submitted successfully',
      data: {
        diagnosis: formatConsultant(consultant),
        appointment: {
          id: appointment.id,
          status: AppointmentStatus.ATTENDED,
          attendedAt,
          residentId: appointment.residentId,
        },
      },
    })
  } catch (err) {
    await transaction.rollback()
    console.error('Submit Appointment Diagnosis Error:', err)
    res.status(500).json({ success: false, message: 'Failed to submit diagnosis' })
  }
}

// ── Diagnosis note attachments (S3) ─────────────────────────────────────────

export const MAX_DIAGNOSIS_FILES = 5
export const MAX_DIAGNOSIS_VOICE_NOTES = 5

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|heic|heif)$/i
const PDF_EXTENSIONS = /\.pdf$/i
const AUDIO_EXTENSIONS = /\.(m4a|aac|mp3|mp4|wav|ogg|oga|opus|3gp|amr|webm|caf)$/i

function getAttachmentFileType(file: Express.Multer.File): ConsultantFileType | null {
  const name = file.originalname || ''
  if (file.mimetype === 'application/pdf' || PDF_EXTENSIONS.test(name)) return 'PDF'
  if (file.mimetype.startsWith('image/') || IMAGE_EXTENSIONS.test(name)) return 'IMAGE'
  return null
}

function isAudioFile(file: Express.Multer.File): boolean {
  return file.mimetype.startsWith('audio/') || AUDIO_EXTENSIONS.test(file.originalname || '')
}

async function uploadDiagnosisFiles(
  files: Express.Multer.File[],
  folder: string,
  userId: string,
  resolveType: (file: Express.Multer.File) => ConsultantFileType,
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
      fileType: resolveType(file),
      uploadedAt: new Date().toISOString(),
      uploadedByUserId: userId,
    })
  }
  return uploaded
}

/**
 * POST /doctor/appointments/:appointmentId/diagnosis/attachments  (multipart/form-data)
 * Files: files[] (image/PDF, max 5 per diagnosis), voiceNotes[] (audio, max 5 per diagnosis).
 * Uploads to S3 and appends to the consultant (draft or completed).
 */
export async function uploadDiagnosisAttachments(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const appointmentId = String(req.params.appointmentId || '').trim()
    if (!appointmentId) {
      res.status(400).json({ success: false, message: 'Appointment ID is required' })
      return
    }

    const access = await assertAppointmentAccess(req, appointmentId)
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message })
      return
    }

    const { appointment } = access
    const userId = req.user?.id || null

    const uploadedFiles = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined
    const attachmentFiles = uploadedFiles?.files || []
    const voiceNoteFiles = uploadedFiles?.voiceNotes || []

    if (attachmentFiles.length === 0 && voiceNoteFiles.length === 0) {
      res.status(400).json({ success: false, message: 'Provide at least one file or voice note' })
      return
    }

    const invalidFile = attachmentFiles.find((f) => !getAttachmentFileType(f))
    if (invalidFile) {
      res.status(400).json({
        success: false,
        message: `"${invalidFile.originalname}" is not a supported file. Upload an image or PDF`,
      })
      return
    }
    const invalidAudio = voiceNoteFiles.find((f) => !isAudioFile(f))
    if (invalidAudio) {
      res.status(400).json({
        success: false,
        message: `"${invalidAudio.originalname}" is not a supported audio file`,
      })
      return
    }

    let row = await Consultant.findOne({
      where: { appointmentId, isDeleted: false },
    })

    const existingAttachments = row ? asArray<ConsultantFileEntry>(row.attachments) : []
    const existingVoiceNotes = row ? asArray<ConsultantFileEntry>(row.voiceNotes) : []

    if (existingAttachments.length + attachmentFiles.length > MAX_DIAGNOSIS_FILES) {
      res.status(400).json({
        success: false,
        message: `You can attach up to ${MAX_DIAGNOSIS_FILES} files to a diagnosis`,
      })
      return
    }
    if (existingVoiceNotes.length + voiceNoteFiles.length > MAX_DIAGNOSIS_VOICE_NOTES) {
      res.status(400).json({
        success: false,
        message: `You can add up to ${MAX_DIAGNOSIS_VOICE_NOTES} voice notes to a diagnosis`,
      })
      return
    }

    const [newAttachments, newVoiceNotes] = await Promise.all([
      uploadDiagnosisFiles(
        attachmentFiles,
        `diagnosis/${appointmentId}/files`,
        String(userId),
        (file) => getAttachmentFileType(file) as ConsultantFileType,
      ),
      uploadDiagnosisFiles(voiceNoteFiles, `diagnosis/${appointmentId}/voice-notes`, String(userId), () => 'AUDIO'),
    ])

    // Assign new arrays (not in-place pushes) so Sequelize detects the JSON change.
    const attachments = [...existingAttachments, ...newAttachments]
    const voiceNotes = [...existingVoiceNotes, ...newVoiceNotes]

    if (!row) {
      row = await Consultant.create({
        appointmentId: appointment.id,
        residentId: appointment.residentId,
        locationId: appointment.locationId,
        doctorId: appointment.doctorId,
        attachments,
        voiceNotes,
        status: DiagnosisStatus.DRAFT,
        createdBy: userId,
        updatedBy: userId,
      })
    } else {
      row.attachments = attachments
      row.voiceNotes = voiceNotes
      row.changed('attachments', true)
      row.changed('voiceNotes', true)
      row.updatedBy = userId
      await row.save()
    }

    res.status(200).json({
      success: true,
      message: 'Attachments uploaded successfully',
      data: formatConsultant(row),
    })
  } catch (err) {
    console.error('Upload Diagnosis Attachments Error:', err)
    res.status(500).json({ success: false, message: 'Failed to upload attachments' })
  }
}

/**
 * DELETE /doctor/appointments/:appointmentId/diagnosis/attachments/:fileId
 * Removes a file or voice note from the consultant.
 */
export async function deleteDiagnosisAttachment(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const appointmentId = String(req.params.appointmentId || '').trim()
    const fileId = String(req.params.fileId || '').trim()
    if (!appointmentId || !fileId) {
      res.status(400).json({ success: false, message: 'Appointment ID and file ID are required' })
      return
    }

    const access = await assertAppointmentAccess(req, appointmentId)
    if (!access.ok) {
      res.status(access.status).json({ success: false, message: access.message })
      return
    }

    const row = await Consultant.findOne({
      where: { appointmentId, isDeleted: false },
    })
    if (!row) {
      res.status(404).json({ success: false, message: 'Attachment not found' })
      return
    }

    const attachments = asArray<ConsultantFileEntry>(row.attachments)
    const voiceNotes = asArray<ConsultantFileEntry>(row.voiceNotes)
    const nextAttachments = attachments.filter((f) => f.id !== fileId)
    const nextVoiceNotes = voiceNotes.filter((f) => f.id !== fileId)

    if (nextAttachments.length === attachments.length && nextVoiceNotes.length === voiceNotes.length) {
      res.status(404).json({ success: false, message: 'Attachment not found' })
      return
    }

    row.attachments = nextAttachments
    row.voiceNotes = nextVoiceNotes
    row.changed('attachments', true)
    row.changed('voiceNotes', true)
    row.updatedBy = req.user?.id || null
    await row.save()

    res.status(200).json({
      success: true,
      message: 'Attachment removed successfully',
      data: formatConsultant(row),
    })
  } catch (err) {
    console.error('Delete Diagnosis Attachment Error:', err)
    res.status(500).json({ success: false, message: 'Failed to remove attachment' })
  }
}

/**
 * GET /doctor/vital-settings
 * Active vital settings for diagnosis vital dropdown.
 */
export async function listVitalSettingsForDoctor(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, message: 'Unauthorized' })
      return
    }

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
    const rows = await VitalSetting.findAll({
      where: { isDeleted: false, isActive: true },
      order: [['name', 'ASC']],
      attributes: ['id', 'name', 'code', 'unit', 'inputType', 'imageUrl'],
    })

    const vitals = rows
      .filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase()))
      .map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code || null,
        unit: r.unit,
        inputType: r.inputType,
        imageUrl: r.imageUrl,
      }))

    res.status(200).json({
      success: true,
      message: 'Vital settings fetched successfully',
      data: { vitals },
    })
  } catch (err) {
    console.error('List Vital Settings Error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch vital settings' })
  }
}
