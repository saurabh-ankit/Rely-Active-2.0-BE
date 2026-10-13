import { Op } from 'sequelize'
import { Consultant, ResidentConditionLog, User, UserDetail } from '../models/index.js'
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
