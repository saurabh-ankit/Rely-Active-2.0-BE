import type { AuthenticatedRequest } from '../middlewares/authenticate.js'

/**
 * Who a resident-app request is acting as.
 *
 * A family member signs in with their own credentials but has no row in
 * `residents` — their flat, property and company all hang off the parent
 * resident. `authenticate` already resolves both ids onto `req.user`, so:
 *
 *   owner          -> { residentId: R1, familyMemberId: null }
 *   family member  -> { residentId: R1, familyMemberId: F1 }
 *
 * Household-scoped data (tickets, gate & security) is queried by `residentId`
 * so the whole flat shares one view. Personal data (food packages and orders,
 * medical appointments) is queried by `familyMemberId`, where a null value
 * means the record belongs to the resident themselves.
 */
export interface HouseholdContext {
  /** The household account id — the same for the owner and every family member. */
  residentId: string
  /** Null when the resident themselves is acting. */
  familyMemberId: string | null
  isFamilyMember: boolean
}

export function resolveHousehold(req: AuthenticatedRequest): HouseholdContext | null {
  const residentId = req.user?.residentId || req.user?.id
  if (!residentId) return null

  const familyMemberId = req.user?.familyMemberId || null

  return {
    residentId,
    familyMemberId,
    isFamilyMember: Boolean(familyMemberId),
  }
}
