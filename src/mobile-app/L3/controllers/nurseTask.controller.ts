import type { Request, Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { HttpError } from '../../../middlewares/error/http-error.js'
import { listMedicationTasks } from '../../../services/medicationTask.service.js'
import { listNurseCareTasks, type CareTaskScope, type CareTaskTab } from '../../../services/nurseCareTask.service.js'
import type { ListNurseTasksQuery } from '../../../validations/nurseTask.validation.js'
import {
  getEmployeeActiveShifts,
  getStaffCareTeamResidentIds,
  getTodayDateStr,
  isAdminOrSuperAdmin,
  resolveUserLocationId,
} from './medical.controller.js'
import { resolveScope } from './nurseMedication.controller.js'

function sendError(res: Response, err: unknown, logLabel: string): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, message: err.message })
    return
  }
  console.error(logLabel, err)
  res.status(500).json({ success: false, message: err instanceof Error ? err.message : 'Unknown error' })
}

/**
 * GET /api/v1/mobile/l3/medical/nurse/tasks?tab&targetDate&search&dateScope
 * Care tasks and medication / insulin doses for the nurse Tasks tab in one response.
 */
export async function getNurseTasks(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const query = req.query as ListNurseTasksQuery
    const tab = query.tab ?? 'PENDING'
    const targetDate = query.targetDate ?? getTodayDateStr()
    const search = query.search ?? ''
    const locationId = await resolveUserLocationId(req)

    const { scope, nurseId, emptyReason } = await resolveScope(req, targetDate, locationId, true)
    if (emptyReason) {
      const empty = { counts: { pending: 0, completed: 0 }, data: [] }
      res.status(200).json({
        success: true,
        tab,
        targetDate,
        locationId,
        counts: empty.counts,
        careTasks: empty,
        medicationTasks: empty,
        message: emptyReason,
      })
      return
    }

    const [careTasks, medicationTasks] = await Promise.all([
      listNurseCareTasks({
        targetDate,
        tab,
        search,
        dateScopeDay: query.dateScope === 'DAY',
        locationId,
        scope,
        nurseId,
      }),
      listMedicationTasks({ targetDate, tab, search, locationId, scope, nurseId }),
    ])

    res.status(200).json({
      success: true,
      tab,
      targetDate,
      locationId,
      counts: {
        pending: careTasks.counts.pending + medicationTasks.counts.pending,
        completed: careTasks.counts.completed + medicationTasks.counts.completed,
      },
      careTasks,
      medicationTasks,
    })
  } catch (err) {
    sendError(res, err, 'getNurseTasks')
  }
}

/**
 * GET /api/v1/mobile/l3/medical/care-tasks
 * Location-wise care tasks with support for Two Tabs: Pending Tasks & Completed Tasks.
 */
export async function getNurseCareTasks(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest
    const locationId = await resolveUserLocationId(authReq)
    const rawTab = String(req.query.tab || 'PENDING').toUpperCase()
    const activeTab: CareTaskTab = rawTab === 'COMPLETED' ? 'COMPLETED' : rawTab === 'ALL' ? 'ALL' : 'PENDING'
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
    const targetDate =
      typeof req.query.targetDate === 'string' && req.query.targetDate ? req.query.targetDate : getTodayDateStr()
    const requestedNurseId = typeof req.query.nurseId === 'string' ? req.query.nurseId.trim() : ''

    const isAdmin = await isAdminOrSuperAdmin(authReq)
    const nurseId = (isAdmin ? requestedNurseId : requestedNurseId || authReq.user?.id) || null
    let scope: CareTaskScope = { residentIds: null, shifts: null }

    if (!isAdmin && nurseId) {
      const sendEmpty = (message: string) =>
        res.status(200).json({
          success: true,
          tab: activeTab,
          locationId,
          counts: { pending: 0, completed: 0 },
          data: [],
          grouped: [],
          message,
        })

      const residentIds = await getStaffCareTeamResidentIds(nurseId, 'NURSE')
      if (residentIds.length === 0) {
        sendEmpty('No residents assigned to nurse care team')
        return
      }
      const shifts = await getEmployeeActiveShifts(nurseId, targetDate, locationId)
      if (shifts.length === 0) {
        sendEmpty('No active shift scheduled for this date')
        return
      }
      scope = { residentIds, shifts }
    }

    const result = await listNurseCareTasks({
      targetDate,
      tab: activeTab,
      search,
      dateScopeDay: String(req.query.dateScope || '').toUpperCase() === 'DAY',
      locationId,
      scope,
      nurseId,
    })

    res.status(200).json({
      success: true,
      tab: activeTab === 'PENDING' ? 'PENDING' : 'COMPLETED',
      locationId,
      ...result,
      ...(activeTab === 'PENDING' ? { grouped: result.data } : {}),
    })
  } catch (error) {
    console.error('Error fetching nurse care tasks:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to fetch nurse care tasks',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
