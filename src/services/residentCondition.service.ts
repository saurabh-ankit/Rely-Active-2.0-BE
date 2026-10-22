import { Op, QueryTypes } from 'sequelize'
import sequelize from '../config/db/index.js'
import { Consultant, ResidentConditionLog, User, UserDetail } from '../models/index.js'
import { CareLevel, ResidentStatus } from '../enums/resident.enum.js'
import { DiagnosisCondition, DiagnosisStatus } from '../enums/diagnosis.enum.js'

export type ResidentConditionSource = 'MANUAL' | 'DOCTOR'

export interface ResidentCurrentCondition {
  condition: DiagnosisCondition
  source: ResidentConditionSource
  note: string | null
  updatedAt: string
  updatedById: string | null
  updatedByName: string | null
}

export const userInclude = (as: string) => ({
  model: User,
  as,
  attributes: ['id', 'username'],
  required: false,
  include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'], required: false }],
})

export function userName(user: User | null | undefined): string | null {
  if (!user) return null
  const profile = user.profile
  const fullName = profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : ''
  return fullName || user.username || null
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

/**
 * The resident's condition as of now: whichever is newer of the latest manual change
 * from the web and the latest completed doctor visit that recorded a condition.
 */
export async function getResidentCurrentCondition(residentId: string): Promise<ResidentCurrentCondition | null> {
  const [log, consultant] = await Promise.all([
    ResidentConditionLog.findOne({
      where: { residentId, isDeleted: false },
      include: [userInclude('creator')],
      order: [['createdAt', 'DESC']],
    }),
    Consultant.findOne({
      where: {
        residentId,
        isDeleted: false,
        status: DiagnosisStatus.COMPLETED,
        condition: { [Op.ne]: null },
      },
      include: [userInclude('doctor')],
      order: [
        ['completedAt', 'DESC'],
        ['updatedAt', 'DESC'],
      ],
    }),
  ])

  const manual: ResidentCurrentCondition | null = log
    ? {
        condition: log.condition,
        source: 'MANUAL',
        note: log.note || null,
        updatedAt: toIso(log.createdAt),
        updatedById: log.createdBy || null,
        updatedByName: userName(log.creator),
      }
    : null

  const doctor: ResidentCurrentCondition | null =
    consultant && consultant.condition
      ? {
          condition: consultant.condition,
          source: 'DOCTOR',
          note: null,
          updatedAt: toIso(consultant.completedAt || consultant.updatedAt),
          updatedById: consultant.doctorId,
          updatedByName: userName(consultant.doctor),
        }
      : null

  if (!manual) return doctor
  if (!doctor) return manual
  return new Date(manual.updatedAt).getTime() >= new Date(doctor.updatedAt).getTime() ? manual : doctor
}

/**
 * Active residents who need close attention on the dashboard.
 * Uses the same "current condition" as the resident detail screen
 * (newer of latest manual log vs latest completed doctor note).
 * Falls back to careLevel = CRITICAL when no condition has been recorded yet.
 */
export async function listCriticalResidentIds(options: {
  locationId?: string | null
  page: number
  limit: number
}): Promise<{ ids: string[]; total: number }> {
  const { locationId = null, page, limit } = options
  const locFilter = locationId ? 'r.locId = :locationId' : '1=1'
  const replacements: Record<string, unknown> = {
    locationId,
    careCritical: CareLevel.CRITICAL,
    conditionCritical: DiagnosisCondition.CRITICAL,
    activeStatus: ResidentStatus.ACTIVE,
    completed: DiagnosisStatus.COMPLETED,
    limit,
    offset: (page - 1) * limit,
  }

  const criticalFrom = `
    FROM residents r
    LEFT JOIN (
      SELECT residentId, \`condition\`, createdAt AS updatedAt
      FROM (
        SELECT residentId, \`condition\`, createdAt,
          ROW_NUMBER() OVER (PARTITION BY residentId ORDER BY createdAt DESC) AS rn
        FROM resident_condition_logs
        WHERE isDeleted = 0
      ) m
      WHERE m.rn = 1
    ) manual ON manual.residentId = r.id
    LEFT JOIN (
      SELECT residentId, \`condition\`, updatedAt
      FROM (
        SELECT residentId, \`condition\`,
          COALESCE(completedAt, updatedAt) AS updatedAt,
          ROW_NUMBER() OVER (
            PARTITION BY residentId
            ORDER BY COALESCE(completedAt, updatedAt) DESC, updatedAt DESC
          ) AS rn
        FROM consultants
        WHERE isDeleted = 0 AND status = :completed AND \`condition\` IS NOT NULL
      ) d
      WHERE d.rn = 1
    ) doctor ON doctor.residentId = r.id
    WHERE r.isDeleted = 0
      AND r.status = :activeStatus
      AND ${locFilter}
      AND (
        CASE
          WHEN manual.residentId IS NULL AND doctor.residentId IS NULL THEN r.careLevel = :careCritical
          WHEN manual.residentId IS NULL THEN doctor.\`condition\` = :conditionCritical
          WHEN doctor.residentId IS NULL THEN manual.\`condition\` = :conditionCritical
          WHEN manual.updatedAt >= doctor.updatedAt THEN manual.\`condition\` = :conditionCritical
          ELSE doctor.\`condition\` = :conditionCritical
        END
      )
  `

  const [countRow] = await sequelize.query<{ total: number }>(`SELECT COUNT(*) AS total ${criticalFrom}`, {
    replacements,
    type: QueryTypes.SELECT,
  })

  const rows = await sequelize.query<{ id: string }>(
    `
    SELECT r.id
    ${criticalFrom}
    ORDER BY r.updatedAt DESC
    LIMIT :limit OFFSET :offset
    `,
    { replacements, type: QueryTypes.SELECT },
  )

  return {
    ids: rows.map((row) => row.id),
    total: Number(countRow?.total ?? 0),
  }
}
