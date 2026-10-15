import type { Response } from 'express'
import { DiagnosisStatus } from '../../../enums/diagnosis.enum.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { Consultant, DoctorAppointment, User, UserDetail } from '../../../models/index.js'
import { getResidentClinicalChart } from '../../../services/residentClinical.service.js'
import { todayYmdLocal } from '../../../utils/roster.util.js'
import { formatConsultant } from '../../L3/controllers/doctorDiagnosis.controller.js'
import { resolveResidentContext } from './appointmentMobile.controller.js'

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/

type ConsultantWithRelations = Consultant & {
  doctor?: (User & { profile?: UserDetail | null }) | null
  appointment?: DoctorAppointment | null
}

const doctorInclude = {
  model: User,
  as: 'doctor',
  attributes: ['id', 'username', 'email'],
  required: false,
  include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'], required: false }],
}

const formatDoctorName = (doctor?: ConsultantWithRelations['doctor']): string => {
  const profile = doctor?.profile
  const fullName = profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : ''
  return fullName || doctor?.username || doctor?.email || 'Doctor'
}

const isActiveMedication = (row: { isUntilDischarge: boolean; endDate: string | null }, today: string): boolean =>
  row.isUntilDischarge || (Boolean(row.endDate) && String(row.endDate).slice(0, 10) >= today)

async function listDiagnosisDates(residentId: string): Promise<string[]> {
  const rows = (await Consultant.findAll({
    where: { residentId, status: DiagnosisStatus.COMPLETED, isDeleted: false },
    attributes: ['id'],
    include: [{ model: DoctorAppointment, as: 'appointment', attributes: ['id', 'appointmentDate'], required: true }],
  })) as ConsultantWithRelations[]

  const dates = new Set<string>()
  for (const row of rows) {
    const date = row.appointment?.appointmentDate
    if (date) dates.add(String(date).slice(0, 10))
  }
  return [...dates].sort((a, b) => b.localeCompare(a))
}

/**
 * GET /medical/history
 * Latest clinical summary for the resident: all allergies, previous doctor notes,
 * the most recent reading per vital type, and active medication / insulin.
 */
export async function getMyMedicalHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ctx = await resolveResidentContext(req)
    if (!ctx) {
      res.status(401).json({ success: false, message: 'Unable to resolve resident context' })
      return
    }

    const [chart, diagnosisDates] = await Promise.all([
      getResidentClinicalChart(ctx.residentId),
      listDiagnosisDates(ctx.residentId),
    ])

    const seenVitalTypes = new Set<string>()
    const recentVitals = chart.vitals.filter((vital) => {
      const key = vital.vitalSettingId || `name:${String(vital.name).toLowerCase()}`
      if (seenVitalTypes.has(key)) return false
      seenVitalTypes.add(key)
      return true
    })

    const today = todayYmdLocal()

    res.status(200).json({
      success: true,
      message: 'Medical history retrieved successfully',
      data: {
        currentCondition: chart.currentCondition,
        allergies: chart.allergies,
        doctorNotes: chart.doctorNotes,
        vitals: recentVitals,
        medications: chart.medications.filter((m) => isActiveMedication(m, today)),
        insulin: chart.insulin.filter((m) => isActiveMedication(m, today)),
        diagnosisDates,
      },
    })
  } catch (err) {
    console.error('Get My Medical History Error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch medical history' })
  }
}

/**
 * GET /medical/history/diagnoses?date=YYYY-MM-DD
 * Completed diagnoses from appointments on the given date.
 */
export async function getMyMedicalHistoryByDate(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ctx = await resolveResidentContext(req)
    if (!ctx) {
      res.status(401).json({ success: false, message: 'Unable to resolve resident context' })
      return
    }

    const date = String(req.query.date || '').trim()
    if (!YMD_PATTERN.test(date)) {
      res.status(400).json({ success: false, message: 'date must be in YYYY-MM-DD format' })
      return
    }

    const rows = (await Consultant.findAll({
      where: { residentId: ctx.residentId, status: DiagnosisStatus.COMPLETED, isDeleted: false },
      include: [
        {
          model: DoctorAppointment,
          as: 'appointment',
          attributes: ['id', 'appointmentDate', 'slotTimeRange', 'attendedAt'],
          where: { appointmentDate: date, isDeleted: false },
          required: true,
        },
        doctorInclude,
      ],
      order: [['completedAt', 'DESC']],
    })) as ConsultantWithRelations[]

    const diagnoses = rows.map((row) => ({
      ...formatConsultant(row),
      doctorName: formatDoctorName(row.doctor),
      appointmentDate: row.appointment?.appointmentDate || date,
      slotTimeRange: row.appointment?.slotTimeRange || null,
      attendedAt: row.appointment?.attendedAt || null,
    }))

    res.status(200).json({
      success: true,
      message: 'Diagnoses retrieved successfully',
      data: { date, diagnoses },
    })
  } catch (err) {
    console.error('Get My Medical History By Date Error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch diagnoses' })
  }
}
