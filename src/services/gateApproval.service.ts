import type { Request } from 'express'
import { GatePreapproved, Resident, ResidentFamilyMember, User, UserDetail } from '../models/index.js'
import type { ApproverType } from '../models/gateEntry.model.js'
import type { AuthenticatedRequest } from '../middlewares/authenticate.js'

/** The gate_entries columns that record who approved (or rejected) an entry. */
export interface GateApproverFields {
  approvedBy: string | null
  approverType: ApproverType
  approverName: string | null
  approvedByResidentId: string | null
  approvedAt: Date
}

const fullName = (first?: string | null, last?: string | null) => `${first ?? ''} ${last ?? ''}`.trim() || null

/** Approval by the resident household that created a pre-approved pass. */
export async function residentApprover(residentId: string, at: Date = new Date()): Promise<GateApproverFields> {
  const resident = await Resident.findByPk(residentId, { attributes: ['id', 'firstName', 'lastName'] })
  return {
    approvedBy: null,
    approverType: 'RESIDENT',
    approverName: fullName(resident?.firstName, resident?.lastName),
    approvedByResidentId: residentId,
    approvedAt: at,
  }
}

/**
 * Approval by whoever made the request: a resident or family member (L1 app),
 * or staff (L3 guard app / admin dashboard). Staff go in `approvedBy`, which
 * references users; residents can't, so they are recorded by household instead.
 */
export async function approverFromRequest(req: Request): Promise<GateApproverFields | null> {
  const user = (req as AuthenticatedRequest).user
  if (!user?.id) return null
  const now = new Date()

  if (user.familyMemberId) {
    const member = await ResidentFamilyMember.findByPk(user.familyMemberId, {
      attributes: ['id', 'firstName', 'lastName'],
    })
    return {
      approvedBy: null,
      approverType: 'FAMILY_MEMBER',
      approverName: fullName(member?.firstName, member?.lastName),
      approvedByResidentId: user.residentId ?? null,
      approvedAt: now,
    }
  }

  if (user.residentId) return residentApprover(user.residentId, now)

  const staff = await User.findByPk(user.id, {
    attributes: ['id', 'username', 'email'],
    include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
  })
  const profile = (staff as (User & { profile?: UserDetail | null }) | null)?.profile
  return {
    approvedBy: user.id,
    approverType: 'STAFF',
    approverName: fullName(profile?.firstName, profile?.lastName) || staff?.username || staff?.email || null,
    approvedByResidentId: null,
    approvedAt: now,
  }
}

// ── Raised by ───────────────────────────────────────────────────────────────

export interface GateRaisedBy {
  type: ApproverType
  name: string | null
  /** Staff user id when a guard raised it, so callers can tell "this employee". */
  userId: string | null
  /** Household resident for pre-approvals. */
  residentName: string | null
}

const staffProfileInclude = { model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }

/** Includes needed by raisedByOf(): the guard behind a walk-in, the resident behind a pre-approval. */
export const gateRaisedByIncludes = () => [
  {
    model: User,
    as: 'createdByUser',
    attributes: ['id', 'username', 'email'],
    include: [staffProfileInclude],
  },
  {
    model: GatePreapproved,
    as: 'preapproved',
    attributes: ['id', 'scheduleType', 'residentId', 'createdBy', 'createdAt'],
    include: [
      { model: Resident, as: 'resident', attributes: ['id', 'firstName', 'lastName'] },
      { model: ResidentFamilyMember, as: 'createdByFamilyMember', attributes: ['id', 'firstName', 'lastName'] },
    ],
  },
]

type WithRaisedBy = {
  entrySource?: string
  createdBy?: string | null
  createdByUser?: (User & { profile?: UserDetail | null }) | null
  preapproved?:
    | (GatePreapproved & {
        resident?: Resident | null
        createdByFamilyMember?: ResidentFamilyMember | null
      })
    | null
}

/**
 * Who raised a gate entry: for a pre-approved visitor, the resident (or family
 * member) who made the pass; for a walk-in, the guard who requested approval.
 * Null when it was never recorded (walk-ins raised before this was tracked).
 */
export function raisedByOf(entry: WithRaisedBy): GateRaisedBy | null {
  const p = entry.preapproved
  if (p) {
    const residentName = fullName(p.resident?.firstName, p.resident?.lastName)
    const member = p.createdByFamilyMember
    return member
      ? {
          type: 'FAMILY_MEMBER',
          name: fullName(member.firstName, member.lastName),
          userId: null,
          residentName,
        }
      : { type: 'RESIDENT', name: residentName, userId: null, residentName }
  }
  const u = entry.createdByUser
  if (u) {
    return {
      type: 'STAFF',
      name: fullName(u.profile?.firstName, u.profile?.lastName) || u.username || u.email || null,
      userId: u.id,
      residentName: null,
    }
  }
  return null
}
