import type { NextFunction, Request, Response } from 'express'
import { verifyToken } from '../utils/jwt.js'
import { Resident, ResidentFamilyMember, User, UserLocation } from '../models/index.js'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    residentId?: string
    familyMemberId?: string
    email?: string | null
    companyId?: string | null
    defaultLocationId?: string | null
    roles: string[]
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
