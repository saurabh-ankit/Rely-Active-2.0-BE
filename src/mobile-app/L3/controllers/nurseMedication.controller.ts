import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { HttpError } from '../../../middlewares/error/http-error.js'
import {
  cancelMedicationTask,
  completeMedicationTask,
  getMedicationTaskDetail,
  listMedicationTasks,
  type MedicationTaskScope,
} from '../../../services/medicationTask.service.js'
import type {
  CancelMedicationTaskInput,
  CompleteMedicationTaskInput,
  ListMedicationTasksQuery,
  MedicationTaskDetailQuery,
  MedicationTaskParams,
} from '../../../validations/medicationTask.validation.js'
import {
  getEmployeeActiveShifts,
  getStaffCareTeamResidentIds,
  getTodayDateStr,
  isAdminOrSuperAdmin,
  resolveUserLocationId,
} from './medical.controller.js'

function sendError(res: Response, err: unknown, logLabel: string): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, message: err.message })
    return
  }
  console.error(logLabel, err)
  res.status(500).json({ success: false, message: err instanceof Error ? err.message : 'Unknown error' })
}

/**
 * Same visibility as nurse care tasks: residents on the nurse's care team, within the
 * nurse's active shifts for the date. Admins see everything.
 */
async function resolveScope(
  req: AuthenticatedRequest,
  targetDate: string,
  locationId: string | null,
  withShifts: boolean,
): Promise<{ scope: MedicationTaskScope; nurseId: string | null; emptyReason: string | null }> {
  if (await isAdminOrSuperAdmin(req)) {
    return { scope: { residentIds: null, shifts: null }, nurseId: null, emptyReason: null }
  }
  const nurseId = req.user!.id
  const residentIds = await getStaffCareTeamResidentIds(nurseId, 'NURSE')
  if (residentIds.length === 0) {
    return { scope: { residentIds, shifts: [] }, nurseId, emptyReason: 'No residents assigned to nurse care team' }
  }
  if (!withShifts) return { scope: { residentIds, shifts: null }, nurseId, emptyReason: null }

  const shifts = await getEmployeeActiveShifts(nurseId, targetDate, locationId)
  if (shifts.length === 0) {
    return { scope: { residentIds, shifts }, nurseId, emptyReason: 'No active shift scheduled for this date' }
  }
  return { scope: { residentIds, shifts }, nurseId, emptyReason: null }
}

/**
 * GET /api/v1/mobile/l3/medical/medication-tasks?tab&targetDate&search
 */
export async function getNurseMedicationTasks(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const query = req.query as ListMedicationTasksQuery
    const tab = query.tab ?? 'PENDING'
    const targetDate = query.targetDate ?? getTodayDateStr()
    const locationId = await resolveUserLocationId(req)

    const { scope, nurseId, emptyReason } = await resolveScope(req, targetDate, locationId, true)
    if (emptyReason) {
      res.status(200).json({
        success: true,
        tab,
        locationId,
        counts: { pending: 0, completed: 0 },
        data: [],
        message: emptyReason,
      })
      return
    }

    const result = await listMedicationTasks({
      targetDate,
      tab,
      search: query.search ?? '',
      locationId,
      scope,
      nurseId,
    })
    res.status(200).json({ success: true, tab, locationId, ...result })
  } catch (err) {
    sendError(res, err, 'getNurseMedicationTasks')
  }
}

/**
 * GET /api/v1/mobile/l3/medical/medication-tasks/:kind/:medicationId?targetDate
 * Every dose of one medication / insulin scheduled on the date, for the task detail screen.
 */
export async function getNurseMedicationTaskDetail(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { kind, medicationId } = req.params as unknown as MedicationTaskParams
    const targetDate = (req.query as MedicationTaskDetailQuery).targetDate ?? getTodayDateStr()
    const { scope } = await resolveScope(req, targetDate, null, false)
    const data = await getMedicationTaskDetail({ kind, medicationId, targetDate, scope })
    res.status(200).json({ success: true, data })
  } catch (err) {
    sendError(res, err, 'getNurseMedicationTaskDetail')
  }
}

/**
 * POST /api/v1/mobile/l3/medical/medication-tasks/complete  (multipart/form-data)
 * Fields: kind, medicationId, timeOfDay, scheduledDate, notes. Files: photos[] (max 5), voiceNote (max 1).
 */
export async function completeNurseMedicationTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const input = req.body as CompleteMedicationTaskInput
    const locationId = await resolveUserLocationId(req)
    const { scope } = await resolveScope(req, input.scheduledDate, locationId, false)
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined

    const data = await completeMedicationTask({
      input,
      userId: req.user!.id,
      today: getTodayDateStr(),
      scope,
      files: { photos: files?.photos ?? [], voiceNotes: files?.voiceNote ?? [] },
    })
    res.status(200).json({ success: true, message: `${data.medicineName} marked as given`, data })
  } catch (err) {
    sendError(res, err, 'completeNurseMedicationTask')
  }
}

/**
 * POST /api/v1/mobile/l3/medical/medication-tasks/cancel  (multipart/form-data)
 * Fields: kind, medicationId, timeOfDay, scheduledDate, notes (reason). Files: photos[] (max 5), voiceNote (max 1).
 */
export async function cancelNurseMedicationTask(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const input = req.body as CancelMedicationTaskInput
    const locationId = await resolveUserLocationId(req)
    const { scope } = await resolveScope(req, input.scheduledDate, locationId, false)
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined

    const data = await cancelMedicationTask({
      input,
      userId: req.user!.id,
      today: getTodayDateStr(),
      scope,
      files: { photos: files?.photos ?? [], voiceNotes: files?.voiceNote ?? [] },
    })
    res.status(200).json({ success: true, message: `${data.medicineName} dose cancelled`, data })
  } catch (err) {
    sendError(res, err, 'cancelNurseMedicationTask')
  }
}
