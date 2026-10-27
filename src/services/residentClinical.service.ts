import { Op, type Includeable, type WhereOptions } from 'sequelize'
import {
  Consultant,
  DoctorAppointment,
  InventoryItem,
  LabTestSetting,
  ResidentAllergy,
  ResidentInsulin,
  ResidentLabReport,
  ResidentMedication,
  Resident,
  ResidentVital,
  User,
  UserDetail,
} from '../models/index.js'
import { DiagnosisCondition, DiagnosisStatus } from '../enums/diagnosis.enum.js'
import { ServiceType } from '../enums/billing.enum.js'
import { HttpError } from '../middlewares/error/http-error.js'
import type { ConsultantFileEntry } from '../models/consultant.model.js'
import { invoicedSourceIds } from './billing/invoicedSources.js'
import { getResidentCurrentCondition, userInclude, userName } from './residentCondition.service.js'

export interface ResidentDoctorNote {
  id: string
  note: string | null
  attachments: ConsultantFileEntry[]
  voiceNotes: ConsultantFileEntry[]
  condition: DiagnosisCondition | null
  completedAt: string | null
  doctorId: string
  doctorName: string | null
  appointmentId: string
  appointmentDate: string | null
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

function numOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Resident a web clinical write applies to; rows inherit the resident's location.
 */
export async function getClinicalResident(residentId: string): Promise<{ id: string; locId: string }> {
  const resident = await Resident.findOne({
    where: { id: residentId, isDeleted: false },
    attributes: ['id', 'locId'],
  })
  if (!resident) {
    throw new HttpError(404, 'Resident not found')
  }
  if (!resident.locId) {
    throw new HttpError(400, 'Resident is not assigned to a location')
  }
  return { id: resident.id, locId: resident.locId }
}

export function formatAllergyRow(row: ResidentAllergy) {
  const data = row.toJSON ? row.toJSON() : row
  return {
    id: data.id,
    name: data.name,
    note: data.note || null,
    recordedAt: toIso(data.recordedAt),
    residentId: data.residentId,
    locationId: data.locationId,
    appointmentId: data.appointmentId || null,
    createdById: data.createdBy || null,
    createdByName: userName(row.creator),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

export function formatVitalRow(row: ResidentVital) {
  const data = row.toJSON ? row.toJSON() : row
  return {
    id: data.id,
    vitalSettingId: data.vitalSettingId || '',
    name: data.name,
    unit: data.unit || '',
    value: data.value || '',
    note: data.note || null,
    recordedAt: toIso(data.recordedAt),
    residentId: data.residentId,
    locationId: data.locationId,
    appointmentId: data.appointmentId || null,
    createdById: data.createdBy || null,
    createdByName: userName(row.creator),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

export function formatMedicationRow(row: ResidentMedication | ResidentInsulin) {
  const data = row.toJSON ? row.toJSON() : row
  const item = (data as { inventoryItem?: { packType?: string | null; packUnit?: string | null } | null }).inventoryItem
  return {
    id: data.id,
    inventoryItemId: data.inventoryItemId,
    packType: item?.packType || null,
    packUnit: item?.packUnit || null,
    medicineName: data.medicineName,
    startDate: data.startDate,
    endDate: data.endDate || null,
    isUntilDischarge: Boolean(data.isUntilDischarge),
    timings: Array.isArray(data.timings) ? data.timings : [],
    note: data.note || null,
    residentId: data.residentId,
    locationId: data.locationId,
    appointmentId: data.appointmentId || null,
    createdById: data.createdBy || null,
    createdByName: userName(row.creator),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }
}

export function formatLabReport(report: ResidentLabReport): Record<string, unknown> {
  const setting = report.labTestSetting
  return {
    id: report.id,
    residentId: report.residentId,
    locationId: report.locationId,
    appointmentId: report.appointmentId,
    labTestSettingId: report.labTestSettingId,
    labTestName: setting?.name ?? null,
    labTestImageUrl: setting?.imageUrl ?? null,
    severity: report.severity,
    reportDate: report.reportDate,
    notes: report.notes,
    cost: numOrNull(report.cost),
    paymentMethod: report.paymentMethod,
    reportFileUrl: report.reportFileUrl,
    receiptFileUrl: report.receiptFileUrl,
    isPaid: !!report.isPaid,
    isActive: report.isActive,
    createdById: report.createdBy || null,
    createdByName: userName(report.creator),
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  }
}

const medicationInventoryInclude: Includeable = {
  model: InventoryItem,
  as: 'inventoryItem',
  attributes: ['id', 'packType', 'packUnit'],
  required: false,
}

export const labReportInclude: Includeable[] = [
  {
    model: LabTestSetting,
    as: 'labTestSetting',
    attributes: ['id', 'name', 'imageUrl', 'description'],
    required: false,
  },
  userInclude('creator'),
]

/**
 * Aggregates allergies / vitals / medications / insulin from dedicated tables,
 * completed doctor notes (text, attachments, voice notes) from consultants, and the current condition.
 */
export async function getResidentClinicalChart(residentId: string) {
  // Dynamic imports avoid a static cycle with fluid/incident services (they use getClinicalResident).
  const [allergyRows, medicationRows, insulinRows, vitalRows, fluidBalances, incidents, consultants, currentCondition] =
    await Promise.all([
      ResidentAllergy.findAll({
        where: { residentId, isDeleted: false },
        include: [userInclude('creator')],
        order: [['recordedAt', 'DESC']],
      }),
      ResidentMedication.findAll({
        where: { residentId, isDeleted: false },
        include: [userInclude('creator'), medicationInventoryInclude],
        order: [['createdAt', 'DESC']],
      }),
      ResidentInsulin.findAll({
        where: { residentId, isDeleted: false },
        include: [userInclude('creator'), medicationInventoryInclude],
        order: [['createdAt', 'DESC']],
      }),
      ResidentVital.findAll({
        where: { residentId, isDeleted: false },
        include: [userInclude('creator')],
        order: [['recordedAt', 'DESC']],
      }),
      import('./residentFluidBalance.service.js').then((m) => m.listResidentFluidBalances(residentId)),
      import('./residentIncident.service.js').then((m) => m.listResidentIncidents(residentId)),
      Consultant.findAll({
        where: { residentId, isDeleted: false, status: DiagnosisStatus.COMPLETED },
        include: [
          {
            model: User,
            as: 'doctor',
            attributes: ['id', 'username'],
            required: false,
            include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'], required: false }],
          },
          {
            model: DoctorAppointment,
            as: 'appointment',
            attributes: ['id', 'appointmentDate'],
            required: false,
          },
        ],
        order: [['updatedAt', 'DESC']],
      }),
      getResidentCurrentCondition(residentId),
    ])

  const allergies = allergyRows.map(formatAllergyRow)
  const vitals = vitalRows.map(formatVitalRow)
  const medications = medicationRows.map(formatMedicationRow)
  const insulin = insulinRows.map(formatMedicationRow)

  const doctorNotes: ResidentDoctorNote[] = []
  for (const row of consultants) {
    const note = row.note && String(row.note).trim() ? row.note : null
    const attachments = Array.isArray(row.attachments) ? row.attachments : []
    const voiceNotes = Array.isArray(row.voiceNotes) ? row.voiceNotes : []
    const condition = row.condition || null
    if (!note && !condition && attachments.length === 0 && voiceNotes.length === 0) continue

    const profile = row.doctor?.profile as UserDetail | undefined
    const doctorName = profile
      ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || null
      : row.doctor?.username || null

    doctorNotes.push({
      id: row.id,
      note,
      attachments,
      voiceNotes,
      condition,
      completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
      doctorId: row.doctorId,
      doctorName,
      appointmentId: row.appointmentId,
      appointmentDate: row.appointment?.appointmentDate ?? null,
    })
  }

  return { allergies, vitals, medications, insulin, fluidBalances, incidents, doctorNotes, currentCondition }
}

/**
 * Resident clinical rows recorded outside the given appointment, shown on the doctor diagnosis screen:
 * all allergies, the latest reading per vital type, and only active medications / insulin.
 */
export async function getResidentPreviousClinical(residentId: string, excludeAppointmentId: string) {
  const previousRows: WhereOptions = {
    [Op.and]: [
      { residentId, isDeleted: false },
      { [Op.or]: [{ appointmentId: null }, { appointmentId: { [Op.ne]: excludeAppointmentId } }] },
    ],
  }
  const today = new Date().toISOString().slice(0, 10)
  const activeMedication: WhereOptions = {
    [Op.and]: [previousRows, { [Op.or]: [{ isUntilDischarge: true }, { endDate: { [Op.gte]: today } }] }],
  }

  const [allergyRows, vitalRows, medicationRows, insulinRows] = await Promise.all([
    ResidentAllergy.findAll({
      where: previousRows,
      include: [userInclude('creator')],
      order: [['recordedAt', 'DESC']],
    }),
    ResidentVital.findAll({
      where: previousRows,
      include: [userInclude('creator')],
      order: [['recordedAt', 'DESC']],
    }),
    ResidentMedication.findAll({
      where: activeMedication,
      include: [userInclude('creator'), medicationInventoryInclude],
      order: [['createdAt', 'DESC']],
    }),
    ResidentInsulin.findAll({
      where: activeMedication,
      include: [userInclude('creator'), medicationInventoryInclude],
      order: [['createdAt', 'DESC']],
    }),
  ])

  const seenVitalTypes = new Set<string>()
  const latestVitals = vitalRows.filter((row) => {
    const key = row.vitalSettingId || `name:${row.name.toLowerCase()}`
    if (seenVitalTypes.has(key)) return false
    seenVitalTypes.add(key)
    return true
  })

  return {
    allergies: allergyRows.map(formatAllergyRow),
    vitals: latestVitals.map(formatVitalRow),
    medications: medicationRows.map(formatMedicationRow),
    insulin: insulinRows.map(formatMedicationRow),
  }
}

export async function listResidentLabReportsForResident(residentId: string) {
  const rows = await ResidentLabReport.findAll({
    where: { residentId, isDeleted: false },
    include: labReportInclude,
    order: [
      ['reportDate', 'DESC'],
      ['createdAt', 'DESC'],
    ],
  })
  const invoiced = await invoicedSourceIds(
    ServiceType.LAB_TEST,
    rows.map((r) => r.id),
  )
  // Invoiced reports are locked; the UI shows them read-only.
  return rows.map((r) => ({ ...formatLabReport(r), isInvoiced: invoiced.has(r.id) }))
}
