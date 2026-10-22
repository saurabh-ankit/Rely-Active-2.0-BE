import type { NextFunction, Request, Response } from 'express'
import { verifyToken } from '../utils/jwt.js'
import { Resident, ResidentFamilyMember, ResidentGuardian, User, UserLocation } from '../models/index.js'
import { listCareRecipients, resolveActingRecipient, type CareRecipient } from '../services/residentGuardian.service.js'
import { isGuardianAllowed } from '../utils/guardianAccess.js'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    residentId?: string
    familyMemberId?: string
    email?: string | null
    companyId?: string | null
    defaultLocationId?: string | null
    roles: string[]
    /** Set when a guardian is acting for one of the flat's residents (see `actingFor`). */
    guardianId?: string
    guardianName?: string
    actingFor?: CareRecipient
  }
  locationId?: string | null
}

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. Please provide a valid Bearer token.',
      })
      return
    }

    const token = authHeader.substring(7)
    const decoded = verifyToken(token)

    if (decoded.roles?.includes('RESIDENT_GUARDIAN')) {
      const guardian = await ResidentGuardian.findByPk(decoded.userId, {
        include: [{ model: Resident, as: 'resident' }],
      })
      const household = guardian?.resident
      if (!guardian || guardian.isDeleted || !guardian.isActive || !household || household.isDeleted) {
        res.status(401).json({ success: false, message: 'Invalid token or guardian account deactivated.' })
        return
      }
      if (!isGuardianAllowed(req.method, req.originalUrl)) {
        res.status(403).json({ success: false, message: 'This action is not available for guardians.' })
        return
      }

      // Act as the resident chosen in the app (X-Acting-For: RESIDENT:<id> | FAMILY_MEMBER:<id>), so
      // household data is the flat's and personal data (orders, appointments, medical) is theirs.
      const recipients = await listCareRecipients(household.id)
      const acting = resolveActingRecipient(recipients, req.headers['x-acting-for'])
      if (!acting) {
        res.status(403).json({
          success: false,
          message: recipients.length
            ? 'Select one of your family members residing in the flat.'
            : 'No one is residing in this flat.',
        })
        return
      }

      req.user = {
        id: acting.familyMemberId || household.id,
        residentId: household.id,
        ...(acting.familyMemberId ? { familyMemberId: acting.familyMemberId } : {}),
        email: guardian.email,
        companyId: household.companyId,
        defaultLocationId: household.locId,
        roles: ['RESIDENT_GUARDIAN', acting.familyMemberId ? 'RESIDENT_FAMILY_MEMBER' : 'RESIDENT'],
        guardianId: guardian.id,
        guardianName: `${guardian.firstName} ${guardian.lastName ?? ''}`.trim(),
        actingFor: acting,
      }
      req.locationId = household.locId || null
      next()
      return
    }

    if (decoded.roles?.includes('RESIDENT')) {
      const resident = await Resident.findByPk(decoded.userId)
      if (!resident || resident.isDeleted || resident.status !== 'ACTIVE') {
        res.status(401).json({
          success: false,
          message: 'Invalid token or resident account deactivated.',
        })
        return
      }

      req.user = {
        id: resident.id,
        residentId: resident.id,
        email: resident.email,
        companyId: resident.companyId,
        defaultLocationId: resident.locId,
        roles: decoded.roles || ['RESIDENT'],
      }
      req.locationId = resident.locId || null
      next()
      return
    }

    if (decoded.roles?.includes('RESIDENT_FAMILY_MEMBER')) {
      const familyMember = await ResidentFamilyMember.findByPk(decoded.userId, {
        include: [{ model: Resident, as: 'resident' }],
      })
      if (!familyMember || familyMember.isDeleted || !familyMember.resident) {
        res.status(401).json({
          success: false,
          message: 'Invalid token or family member account deactivated.',
        })
        return
      }

      req.user = {
        id: familyMember.id,
        residentId: familyMember.resident.id,
        familyMemberId: familyMember.id,
        email: familyMember.email || familyMember.resident.email,
        companyId: familyMember.resident.companyId,
        defaultLocationId: familyMember.resident.locId,
        roles: decoded.roles || ['RESIDENT_FAMILY_MEMBER'],
      }
      req.locationId = familyMember.resident.locId || null
      next()
      return
    }

    const user = await User.findByPk(decoded.userId)
    if (!user || !user.isActive || user.isDeleted) {
      res.status(401).json({
        success: false,
        message: 'Invalid token or user account deactivated.',
      })
      return
    }

    const headerLocId = (req.headers['x-location-id'] || req.headers['x-property-id']) as string | undefined

    let locationId =
      headerLocId || user.defaultLocationId || (decoded as { defaultLocationId?: string }).defaultLocationId || null
    if (!locationId) {
      const userLoc = await UserLocation.findOne({
        where: { userId: user.id, isDeleted: false, isActive: true },
      })
      if (userLoc) {
        locationId = userLoc.locId
      }
    }

    req.user = {
      id: user.id,
      email: user.email,
      companyId: user.companyId,
      defaultLocationId: locationId,
      roles: decoded.roles || [],
    }

    req.locationId = locationId

    next()
  } catch {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication token.',
    })
  }
}
