import { Op, type WhereOptions } from 'sequelize'
import {
  CareTask,
  CareTaskAssignment,
  Consultant,
  DoctorAppointment,
  LabTestSetting,
  ResidentAllergy,
  ResidentCareTaskCompletion,
  ResidentConditionLog,
  ResidentInsulin,
  ResidentLabReport,
  ResidentMedication,
  ResidentVital,
  User,
  UserDetail,
} from '../models/index.js'
import { AppointmentStatus } from '../enums/appointment.enum.js'
import { DiagnosisStatus } from '../enums/diagnosis.enum.js'
import { MedicationMealTiming, MedicationRoute } from '../enums/medication.enum.js'
import type { ResidentTimelineQuery } from '../validations/residentTimeline.validation.js'
import { RESIDENT_TIMELINE_EVENT_TYPES } from '../validations/residentTimeline.validation.js'

export type ResidentTimelineEventType = (typeof RESIDENT_TIMELINE_EVENT_TYPES)[number]

export interface ResidentTimelineUser {
  id: string
  name: string
}

export interface ResidentTimelineEvent {
  id: string
  type: ResidentTimelineEventType
  title: string
  description: string
  at: string
  createdAt: string
  createdBy: ResidentTimelineUser | null
  fileUrl?: string | null
  meta: Record<string, unknown>
}

export interface ResidentTimelinePagination {
  total: number
  page: number
  limit: number
  totalPages: number
  hasNext: boolean
  hasPrevious: boolean
}

export interface ResidentTimelineResult {
  events: ResidentTimelineEvent[]
  pagination: ResidentTimelinePagination
}

/** Upper bound of rows read per source before merging; the timeline is paged in memory. */
const SOURCE_ROW_LIMIT = 1000

interface PendingEvent extends Omit<ResidentTimelineEvent, 'createdBy'> {
  userId: string | null
}

interface DateRange {
  from: Date | null
  to: Date | null
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function toIso(value: Date | string | null | undefined): string {
  return toDate(value)?.toISOString() ?? ''
}

function buildRange(startDate?: string, endDate?: string): DateRange {
  return {
    from: startDate ? new Date(`${startDate}T00:00:00`) : null,
    to: endDate ? new Date(`${endDate}T23:59:59.999`) : null,
  }
}

function rangeCondition(range: DateRange): Record<symbol, Date> | null {
  if (range.from && range.to) return { [Op.between]: [range.from, range.to] } as unknown as Record<symbol, Date>
  if (range.from) return { [Op.gte]: range.from }
  if (range.to) return { [Op.lte]: range.to }
  return null
}

/** Matches rows where any of the given columns falls inside the range. */
function anyColumnInRange(columns: string[], range: DateRange): WhereOptions {
  const cond = rangeCondition(range)
  if (!cond) return {}
  return { [Op.or]: columns.map((col) => ({ [col]: cond })) }
}

function isInRange(at: string, range: DateRange): boolean {
  const d = toDate(at)
  if (!d) return false
  if (range.from && d < range.from) return false
  if (range.to && d > range.to) return false
  return true
}

function joinParts(...parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p ? String(p).trim() : ''))
    .filter(Boolean)
    .join(' - ')
}

function humanize(value: string | null | undefined): string {
  if (!value) return ''
  const lower = value.replace(/_/g, ' ').toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

const ROUTE_LABELS: Record<MedicationRoute, string> = {
  [MedicationRoute.ORAL]: 'Oral',
  [MedicationRoute.IV]: 'IV',
  [MedicationRoute.IM]: 'IM',
  [MedicationRoute.SC]: 'SC',
  [MedicationRoute.TOPICAL]: 'Topical',
  [MedicationRoute.INHALATION]: 'Inhalation',
  [MedicationRoute.RECTAL]: 'Rectal',
  [MedicationRoute.OTHER]: 'Other',
}

const MEAL_TIMING_LABELS: Record<MedicationMealTiming, string> = {
  [MedicationMealTiming.BEFORE_FOOD]: 'Before food',
  [MedicationMealTiming.AFTER_FOOD]: 'After food',
  [MedicationMealTiming.WITH_FOOD]: 'With food',
  [MedicationMealTiming.NONE]: '',
}

/** "20:30" -> "8:30 PM" */
function formatTime12h(time: string | null | undefined): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(time || '')
  if (!match) return time || '-'
  const hours = Number(match[1])
  return `${hours % 12 || 12}:${match[2]} ${hours >= 12 ? 'PM' : 'AM'}`
}

function userName(user: User | null | undefined): string | null {
  if (!user) return null
  const profile = user.profile
  const full = profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : ''
  return full || user.username || user.email || null
}

/** `reportDate` is DATEONLY; use the upload time when it was added the same day, otherwise start of that day. */
function labReportTime(reportDate: string | null | undefined, createdAt: Date | string): string {
  const created = toDate(createdAt)
  if (!reportDate) return toIso(created)
  const reportDay = new Date(`${reportDate}T00:00:00`)
  if (created && created.toDateString() === reportDay.toDateString()) return created.toISOString()
  return reportDay.toISOString()
}

async function loadAllergies(residentId: string, range: DateRange): Promise<PendingEvent[]> {
  const rows = await ResidentAllergy.findAll({
    where: { residentId, isDeleted: false, ...anyColumnInRange(['recordedAt'], range) },
    order: [['recordedAt', 'DESC']],
    limit: SOURCE_ROW_LIMIT,
  })
  return rows.map((row) => ({
    id: `allergy:${row.id}:recorded`,
    type: 'allergy',
    title: 'Allergy Recorded',
    description: joinParts(row.name, row.note),
    at: toIso(row.recordedAt),
    createdAt: toIso(row.createdAt),
    userId: row.createdBy || null,
    meta: { sourceId: row.id, appointmentId: row.appointmentId || null },
  }))
}

async function loadConditionChanges(residentId: string, range: DateRange): Promise<PendingEvent[]> {
  const rows = await ResidentConditionLog.findAll({
    where: { residentId, isDeleted: false, ...anyColumnInRange(['createdAt'], range) },
    order: [['createdAt', 'DESC']],
    limit: SOURCE_ROW_LIMIT,
  })
  return rows.map((row) => ({
    id: `condition:${row.id}:updated`,
    type: 'condition',
    title: 'Condition Updated',
    description: joinParts(`Condition: ${humanize(row.condition)}`, row.note),
    at: toIso(row.createdAt),
    createdAt: toIso(row.createdAt),
    userId: row.createdBy || null,
    meta: { sourceId: row.id, condition: row.condition },
  }))
}

async function loadVitals(residentId: string, range: DateRange): Promise<PendingEvent[]> {
  const rows = await ResidentVital.findAll({
    where: { residentId, isDeleted: false, ...anyColumnInRange(['recordedAt'], range) },
    order: [['recordedAt', 'DESC']],
    limit: SOURCE_ROW_LIMIT,
  })
  return rows.map((row) => {
    const reading = `${row.name}: ${row.value || '-'}${row.unit ? ` ${row.unit}` : ''}`
    return {
      id: `vital:${row.id}:recorded`,
      type: 'vital',
      title: 'Vital Recorded',
      description: joinParts(reading, row.note),
      at: toIso(row.recordedAt),
      createdAt: toIso(row.createdAt),
      userId: row.createdBy || null,
      meta: {
        sourceId: row.id,
        vitalSettingId: row.vitalSettingId || null,
        name: row.name,
        value: row.value,
        unit: row.unit,
        appointmentId: row.appointmentId || null,
      },
    }
  })
}

async function loadMedications(
  residentId: string,
  range: DateRange,
  kind: 'medication' | 'insulin',
): Promise<PendingEvent[]> {
  const model = kind === 'medication' ? ResidentMedication : ResidentInsulin
  const rows: Array<ResidentMedication | ResidentInsulin> = await (model as typeof ResidentMedication).findAll({
    where: { residentId, isDeleted: false, ...anyColumnInRange(['createdAt'], range) },
    order: [['createdAt', 'DESC']],
    limit: SOURCE_ROW_LIMIT,
  })
  const label = kind === 'medication' ? 'Medication' : 'Insulin'
  return rows.flatMap((row) => {
    const until = row.isUntilDischarge ? 'until discharge' : row.endDate || 'ongoing'
    const period = `From ${row.startDate} to ${until}`
    const base = {
      type: kind,
      at: toIso(row.createdAt),
      createdAt: toIso(row.createdAt),
      userId: row.createdBy || null,
    }
    const meta = {
      sourceId: row.id,
      medicineName: row.medicineName,
      startDate: row.startDate,
      endDate: row.endDate || null,
      isUntilDischarge: Boolean(row.isUntilDischarge),
      appointmentId: row.appointmentId || null,
    }

    const timings = (Array.isArray(row.timings) ? row.timings : []).filter((t) => t.selected)
    if (timings.length === 0) {
      return [
        {
          ...base,
          id: `${kind}:${row.id}:assigned`,
          title: `${label} Assigned: ${row.medicineName}`,
          description: joinParts(period, row.note),
          meta,
        },
      ]
    }

    return timings.map<PendingEvent>((timing) => {
      const timeOfDay = humanize(timing.timeOfDay)
      const mealTiming = MEAL_TIMING_LABELS[timing.mealTiming] || ''
      const details = [
        `Dose: ${timing.dose}${kind === 'insulin' ? ' units' : ''}`,
        `Route: ${ROUTE_LABELS[timing.route] || humanize(timing.route)}`,
        `Time: ${formatTime12h(timing.time)}`,
        mealTiming ? `Meal Timing: ${mealTiming}` : null,
        period,
      ]
        .filter(Boolean)
        .join(', ')
      return {
        ...base,
        id: `${kind}:${row.id}:assigned:${timing.timeOfDay}`,
        title: `${label} Assigned: ${row.medicineName} (${timeOfDay})`,
        description: joinParts(details, row.note),
        meta: { ...meta, timeOfDay: timing.timeOfDay, time: timing.time, dose: timing.dose },
      }
    })
  })
}

async function loadLabReports(residentId: string, range: DateRange, startDate?: string, endDate?: string) {
  const reportDateCond: Record<symbol, string> = {}
  if (startDate) reportDateCond[Op.gte] = startDate
  if (endDate) reportDateCond[Op.lte] = endDate
  const createdCond = rangeCondition(range)
  const rangeWhere: WhereOptions = createdCond
    ? { [Op.or]: [{ reportDate: reportDateCond }, { createdAt: createdCond }] }
    : {}

  const rows = await ResidentLabReport.findAll({
    where: { residentId, isDeleted: false, ...rangeWhere },
    include: [{ model: LabTestSetting, as: 'labTestSetting', attributes: ['id', 'name'], required: false }],
    order: [
      ['reportDate', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    limit: SOURCE_ROW_LIMIT,
  })
  return rows.map<PendingEvent>((row) => {
    const name = row.labTestSetting?.name || 'Lab Test'
    return {
      id: `lab:${row.id}:added`,
      type: 'lab',
      title: 'Lab Report Added',
      description: joinParts(`${name} (${humanize(row.severity)})`, row.notes),
      at: labReportTime(row.reportDate, row.createdAt),
      createdAt: toIso(row.createdAt),
      userId: row.createdBy || null,
      fileUrl: row.reportFileUrl || null,
      meta: {
        sourceId: row.id,
        labTestName: name,
        severity: row.severity,
        reportDate: row.reportDate,
        receiptFileUrl: row.receiptFileUrl || null,
        appointmentId: row.appointmentId || null,
      },
    }
  })
}

async function loadAppointments(residentId: string, range: DateRange): Promise<PendingEvent[]> {
  const rows = await DoctorAppointment.findAll({
    where: {
      residentId,
      isDeleted: false,
      ...anyColumnInRange(['bookedAt', 'cancelledAt', 'attendedAt', 'updatedAt'], range),
    },
    include: [
      {
        model: Consultant,
        as: 'consultant',
        attributes: ['id', 'note', 'condition', 'status', 'completedAt'],
        where: { status: DiagnosisStatus.COMPLETED, isDeleted: false },
        required: false,
      },
    ],
    order: [['bookedAt', 'DESC']],
    limit: SOURCE_ROW_LIMIT,
  })

  const events: PendingEvent[] = []
  for (const row of rows) {
    const slot = `${row.appointmentDate}${row.slotTimeRange ? ` (${row.slotTimeRange})` : ''}`
    const baseMeta = {
      sourceId: row.id,
      appointmentDate: row.appointmentDate,
      slotTimeRange: row.slotTimeRange,
      status: row.status,
      doctorId: row.doctorId,
    }

    events.push({
      id: `appointment:${row.id}:booked`,
      type: 'appointment',
      title: 'Appointment Booked',
      description: joinParts(`Doctor visit scheduled for ${slot}`, row.notes),
      at: toIso(row.bookedAt || row.createdAt),
      createdAt: toIso(row.createdAt),
      userId: row.createdBy || null,
      meta: baseMeta,
    })

    if (row.status === AppointmentStatus.CANCELLED && row.cancelledAt) {
      events.push({
        id: `appointment:${row.id}:cancelled`,
        type: 'appointment',
        title: 'Appointment Cancelled',
        description: joinParts(`Doctor visit for ${slot} was cancelled`, row.cancellationReason),
        at: toIso(row.cancelledAt),
        createdAt: toIso(row.cancelledAt),
        userId: row.updatedBy || null,
        meta: baseMeta,
      })
    }

    if (row.status === AppointmentStatus.NO_SHOW) {
      events.push({
        id: `appointment:${row.id}:no_show`,
        type: 'appointment',
        title: 'Appointment Missed',
        description: `Resident did not attend the doctor visit for ${slot}`,
        at: toIso(row.updatedAt),
        createdAt: toIso(row.updatedAt),
        userId: row.updatedBy || null,
        meta: baseMeta,
      })
    }

    const consultant = (row as DoctorAppointment & { consultant?: Consultant | null }).consultant
    const completedAt = row.attendedAt || consultant?.completedAt
    if (row.status === AppointmentStatus.ATTENDED && completedAt) {
      const condition = consultant?.condition ? `Condition: ${humanize(consultant.condition)}` : null
      events.push({
        id: `appointment:${row.id}:attended`,
        type: 'appointment',
        title: 'Doctor Visit Completed',
        description: joinParts(condition, consultant?.note) || `Doctor visit for ${slot} completed`,
        at: toIso(completedAt),
        createdAt: toIso(completedAt),
        userId: row.doctorId,
        meta: { ...baseMeta, consultantId: consultant?.id || null, condition: consultant?.condition || null },
      })
    }
  }
  return events
}

async function loadCareTasks(residentId: string, range: DateRange): Promise<PendingEvent[]> {
  const taskInclude = { model: CareTask, as: 'task', attributes: ['id', 'careTaskName'], required: false }
  const [assignments, completions] = await Promise.all([
    CareTaskAssignment.findAll({
      where: { residentId, isDeleted: false, ...anyColumnInRange(['createdAt', 'stoppedAt'], range) },
      include: [taskInclude],
      order: [['createdAt', 'DESC']],
      limit: SOURCE_ROW_LIMIT,
    }),
    ResidentCareTaskCompletion.findAll({
      where: { residentId, isDeleted: false, ...anyColumnInRange(['completedAt'], range) },
      include: [taskInclude],
      order: [['completedAt', 'DESC']],
      limit: SOURCE_ROW_LIMIT,
    }),
  ])

  const events: PendingEvent[] = []
  for (const row of assignments) {
    const taskName = row.task?.careTaskName || 'Care task'
    const meta = { sourceId: row.id, taskId: row.taskId, status: row.status, source: row.source }
    events.push({
      id: `care_task:${row.id}:assigned`,
      type: 'care_task',
      title: 'Care Task Assigned',
      description: joinParts(taskName, row.customInstructions),
      at: toIso(row.createdAt),
      createdAt: toIso(row.createdAt),
      userId: row.createdBy || null,
      meta,
    })
    if ((row.status === 'STOPPED' || row.status === 'CANCELLED') && row.stoppedAt) {
      events.push({
        id: `care_task:${row.id}:stopped`,
        type: 'care_task',
        title: row.status === 'CANCELLED' ? 'Care Task Cancelled' : 'Care Task Stopped',
        description: taskName,
        at: toIso(row.stoppedAt),
        createdAt: toIso(row.stoppedAt),
        userId: row.stoppedBy || row.updatedBy || null,
        meta,
      })
    }
  }

  for (const row of completions) {
    const taskName = row.task?.careTaskName || 'Care task'
    const isCancelled = row.status === 'CANCELLED'
    events.push({
      id: `care_task:${row.id}:${isCancelled ? 'completion_cancelled' : 'completed'}`,
      type: 'care_task',
      title: isCancelled ? 'Care Task Cancelled' : 'Care Task Completed',
      description: joinParts(taskName, row.remarks || row.description),
      at: toIso(row.completedAt),
      createdAt: toIso(row.createdAt),
      userId: row.completedBy || row.createdBy || null,
      meta: {
        sourceId: row.id,
        assignmentId: row.residentCareTaskAssignmentId,
        taskId: row.taskId,
        status: row.status,
      },
    })
  }
  return events
}

async function loadUsers(ids: Iterable<string>): Promise<Map<string, ResidentTimelineUser>> {
  const unique = Array.from(new Set(Array.from(ids).filter(Boolean)))
  const map = new Map<string, ResidentTimelineUser>()
  if (unique.length === 0) return map

  const users = await User.findAll({
    where: { id: unique },
    attributes: ['id', 'username', 'email'],
    include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'], required: false }],
  })
  for (const user of users) {
    const name = userName(user)
    if (name) map.set(user.id, { id: user.id, name })
  }
  return map
}

/**
 * Builds a resident's timeline from the clinical and care tables, newest event first.
 * Each source is read with the date range applied, then merged and paged in memory.
 */
export async function getResidentTimeline(
  residentId: string,
  query: ResidentTimelineQuery,
): Promise<ResidentTimelineResult> {
  const { startDate, endDate, type, types } = query
  const page = query.page ?? 1
  const limit = query.limit ?? 10
  const range = buildRange(startDate, endDate)
  const selected = new Set<ResidentTimelineEventType>([...(types ?? []), ...(type ? [type] : [])])
  const wants = (t: ResidentTimelineEventType) => selected.size === 0 || selected.has(t)

  const [allergies, vitals, medications, insulin, labs, appointments, careTasks, conditions] = await Promise.all([
    wants('allergy') ? loadAllergies(residentId, range) : [],
    wants('vital') ? loadVitals(residentId, range) : [],
    wants('medication') ? loadMedications(residentId, range, 'medication') : [],
    wants('insulin') ? loadMedications(residentId, range, 'insulin') : [],
    wants('lab') ? loadLabReports(residentId, range, startDate, endDate) : [],
    wants('appointment') ? loadAppointments(residentId, range) : [],
    wants('care_task') ? loadCareTasks(residentId, range) : [],
    wants('condition') ? loadConditionChanges(residentId, range) : [],
  ])

  const pending = [
    ...allergies,
    ...vitals,
    ...medications,
    ...insulin,
    ...labs,
    ...appointments,
    ...careTasks,
    ...conditions,
  ].filter((e) => e.at && isInRange(e.at, range))

  pending.sort((a, b) => {
    const diff = new Date(b.at).getTime() - new Date(a.at).getTime()
    if (diff !== 0) return diff
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  })

  const total = pending.length
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const offset = (page - 1) * limit
  const pageItems = pending.slice(offset, offset + limit)

  const users = await loadUsers(pageItems.map((e) => e.userId).filter((id): id is string => Boolean(id)))
  const events: ResidentTimelineEvent[] = pageItems.map(({ userId, ...rest }) => ({
    ...rest,
    createdBy: userId ? (users.get(userId) ?? null) : null,
  }))

  return {
    events,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNext: offset + limit < total,
      hasPrevious: page > 1,
    },
  }
}
