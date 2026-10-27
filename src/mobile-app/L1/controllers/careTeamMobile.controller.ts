import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import {
  JobCategory,
  Resident,
  ResidentCareTeam,
  Role,
  Specialization,
  User,
  UserDetail,
  UserLocation,
} from '../../../models/index.js'
import { resolveHousehold } from '../../../utils/household.util.js'

type CareTeamGroup = 'doctors' | 'nurses' | 'caretakers'

export interface CareTeamMember {
  userId: string
  /** From the staff member's profile (falls back to their login email) */
  name: string
  /** Their role at the resident's property, e.g. "Doctor", "Nurse", "Caretaker" */
  role: string | null
  specialization: string | null
  /** In-house or visiting medical staff (job category at the resident's property) */
  category: 'INHOUSE' | 'VISITING' | null
  phone: string | null
  photoUrl: string | null
}

const staffInclude = (locId: string) => [
  { model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName', 'phone', 'photoUrl'] },
  { model: Specialization, as: 'specializations', attributes: ['name'], through: { attributes: [] }, required: false },
  {
    model: UserLocation,
    as: 'userLocations',
    where: { locId, isDeleted: false },
    required: false,
    attributes: ['id'],
    include: [
      { model: Role, as: 'role', attributes: ['code', 'name'] },
      { model: JobCategory, as: 'jobCategory', attributes: ['code'] },
    ],
  },
]

type StaffUser = User & {
  profile?: UserDetail | null
  specializations?: { name: string }[]
  userLocations?: (UserLocation & {
    role?: { code: string; name: string } | null
    jobCategory?: { code: string } | null
  })[]
}

/** Everything comes from the staff member's own records; nothing is filled in. */
const toMember = (user: StaffUser): CareTeamMember => {
  const profile = user.profile
  const jobCodes = (user.userLocations || []).map((ul) => ul.jobCategory?.code || '')
  return {
    userId: user.id,
    name: `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim() || user.email || '',
    role: user.userLocations?.find((ul) => ul.role?.name)?.role?.name || null,
    specialization: user.specializations?.[0]?.name || null,
    category: jobCodes.includes('MED_INHOUSE') ? 'INHOUSE' : jobCodes.includes('MED_VISITING') ? 'VISITING' : null,
    phone: profile?.phone || user.phone || null,
    photoUrl: profile?.photoUrl || null,
  }
}

/**
 * GET /api/v1/mobile/l1/medical/care-team — the care team the property assigned to the resident,
 * exactly as on the admin web's "Assign Care Team" (same rows as GET /residents/:id/care-team).
 * `caretakers` stays empty until caretakers can be assigned there (the team has doctors and nurses).
 */
export async function getMyCareTeam(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const household = resolveHousehold(req)
    if (!household) {
      res.status(401).json({ success: false, message: 'Authentication required' })
      return
    }
    const resident = await Resident.findOne({
      where: { id: household.residentId, isDeleted: false },
      attributes: ['id', 'locId'],
    })
    if (!resident) {
      res.status(404).json({ success: false, message: 'Resident not found' })
      return
    }

    const assigned = await ResidentCareTeam.findAll({
      where: { residentId: resident.id, isDeleted: false },
      include: [{ model: User, as: 'user', include: staffInclude(resident.locId) }],
      order: [['createdAt', 'ASC']],
    })

    const team: Record<CareTeamGroup, CareTeamMember[]> = { doctors: [], nurses: [], caretakers: [] }
    const seen = new Set<string>()
    const add = (user: StaffUser | null | undefined, group: CareTeamGroup) => {
      if (!user || seen.has(user.id)) return
      seen.add(user.id)
      team[group].push(toMember(user))
    }

    assigned.forEach((row) => {
      const user = (row as ResidentCareTeam & { user?: StaffUser }).user
      add(user, row.role === 'DOCTOR' ? 'doctors' : 'nurses')
    })

    res.status(200).json({ success: true, data: team })
  } catch (err) {
    console.error('Error loading care team:', err)
    res.status(500).json({ success: false, message: 'Failed to load care team' })
  }
}
