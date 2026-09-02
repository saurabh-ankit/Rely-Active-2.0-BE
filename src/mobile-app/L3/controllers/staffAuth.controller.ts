import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { Op } from 'sequelize'
import { Department, JobCategory, Property, Role, User, UserDetail, UserLocation } from '../../../models/index.js'
import { generateToken, verifyToken } from '../../../utils/jwt.js'
import { AuthorizationService } from '../../../services/authorization.service.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'

const ALLOWED_L3_DEPT_CODES = ['FNB', 'SEC', 'CON', 'RNM', 'HK', 'HOUSEKEEPING', 'EVT', 'EVENTS']

export function isAllowedL3Department(deptName?: string | null, deptCode?: string | null): boolean {
  if (deptCode && ALLOWED_L3_DEPT_CODES.includes(deptCode.toUpperCase())) {
    return true
  }
  if (!deptName) return false
  const nameUpper = deptName.toUpperCase()
  return (
    nameUpper.includes('FOOD') ||
    nameUpper.includes('BEVERAGE') ||
    nameUpper.includes('F&B') ||
    nameUpper.includes('FNB') ||
    nameUpper.includes('SECURITY') ||
    nameUpper.includes('GATE') ||
    nameUpper.includes('CONCIERGE') ||
    nameUpper.includes('REPAIR') ||
    nameUpper.includes('MAINTENANCE') ||
    nameUpper.includes('R&M') ||
    nameUpper.includes('HOUSEKEEPING') ||
    nameUpper.includes('CLEANING') ||
    nameUpper.includes('EVENT')
  )
}

/**
 * POST /api/v1/mobile/l3/auth/login
 * Staff mobile app login for L3 staff replica.
 * Restricted to Food & Beverage, Gate & Security, Concierge, Repair & Maintenance, Housekeeping, and Event.
 */
export async function staffLogin(req: Request, res: Response): Promise<void> {
  try {
    const { username, email, phone, password } = req.body
    const identifier = (username || email || phone || '').toString().trim()

    if (!identifier || !password) {
      res.status(400).json({
        success: false,
        message: 'Please provide staff username/email and password.',
      })
      return
    }

    const user = await User.findOne({
      where: {
        [Op.or]: [{ username: identifier }, { email: identifier }, { phone: identifier }],
        isDeleted: false,
      },
      include: [
        { model: UserDetail, as: 'profile' },
        {
          model: UserLocation,
          as: 'userLocations',
          where: { isDeleted: false },
          required: false,
          include: [
            { model: Department, as: 'department' },
            { model: JobCategory, as: 'jobCategory' },
            { model: Role, as: 'role' },
            { model: Property, as: 'property' },
          ],
        },
      ],
    })

    if (!user || !user.passwordHash) {
      res.status(401).json({
        success: false,
        message: 'Invalid staff credentials.',
      })
      return
    }

    if (user.status !== 'ACTIVE' || !user.isActive) {
      res.status(403).json({
        success: false,
        message: 'Staff account is pending approval or inactive.',
      })
      return
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash)
    if (!isMatch) {
      res.status(401).json({
        success: false,
        message: 'Invalid staff credentials.',
      })
      return
    }

    const userWithAssoc = user as User & { profile?: unknown; userLocations?: unknown[] }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userLocs = (userWithAssoc.userLocations || []) as any[]
    const userDepts = userLocs.map((ul) => ul.department).filter((d): d is Department => Boolean(d && !d.isDeleted))

    const authCtx = await AuthorizationService.getUserAuthorizationContext(user.id)

    const hasAllowedDept = authCtx.isSuperAdmin || userDepts.some((d) => isAllowedL3Department(d.name, d.code))

    if (!hasAllowedDept) {
      res.status(403).json({
        success: false,
        message:
          'Access restricted: Only staff members assigned to Food & Beverage, Gate & Security, Concierge, Repair & Maintenance, Housekeeping, or Event departments can log in to the L3 Mobile App.',
      })
      return
    }

    const primaryDept = userDepts.find((d) => isAllowedL3Department(d.name, d.code)) || userDepts[0] || null
    const primaryUserLoc = userLocs.find((ul) => ul.departmentId === primaryDept?.id) || userLocs[0]

    const token = generateToken({
      userId: user.id,
      email: user.email,
      companyId: user.companyId,
      defaultLocationId: primaryUserLoc?.locId || user.defaultLocationId,
      roles: authCtx.roles,
    })

    res.status(200).json({
      success: true,
      message: 'Staff mobile login successful',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          phone: user.phone,
          companyId: user.companyId,
          defaultLocationId: primaryUserLoc?.locId || user.defaultLocationId,
          department: primaryDept
            ? {
                id: primaryDept.id,
                code: primaryDept.code,
                name: primaryDept.name,
              }
            : null,
          jobCategory: primaryUserLoc?.jobCategory
            ? {
                id: primaryUserLoc.jobCategory.id,
                code: primaryUserLoc.jobCategory.code,
                name: primaryUserLoc.jobCategory.name,
              }
            : null,
          role: primaryUserLoc?.role?.name || authCtx.roles[0] || 'STAFF',
          profile: userWithAssoc.profile || null,
          assignedDepartments: userDepts.map((d) => ({ id: d.id, code: d.code, name: d.name })),
          isSuperAdmin: authCtx.isSuperAdmin,
        },
      },
    })
  } catch (error) {
    console.error('Error in staff mobile login:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to process staff login request.',
    })
  }
}

/**
 * GET /api/v1/mobile/l3/auth/profile
 * Get authenticated L3 staff profile.
 */
export async function getStaffProfile(req: Request, res: Response): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null
    const reqAuth = req as AuthenticatedRequest
    const userId = reqAuth.user?.id || (token ? verifyToken(token)?.userId : null)

    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required' })
      return
    }

    const user = await User.findByPk(userId, {
      include: [
        { model: UserDetail, as: 'profile' },
        {
          model: UserLocation,
          as: 'userLocations',
          where: { isDeleted: false },
          required: false,
          include: [
            { model: Department, as: 'department' },
            { model: JobCategory, as: 'jobCategory' },
            { model: Role, as: 'role' },
            { model: Property, as: 'property' },
          ],
        },
      ],
    })

    if (!user) {
      res.status(404).json({ success: false, message: 'Staff user profile not found' })
      return
    }

    const userWithAssoc = user as User & { profile?: unknown; userLocations?: unknown[] }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userLocs = (userWithAssoc.userLocations || []) as any[]
    const userDepts = userLocs.map((ul) => ul.department).filter((d): d is Department => Boolean(d && !d.isDeleted))

    const authCtx = await AuthorizationService.getUserAuthorizationContext(user.id)
    const primaryDept = userDepts.find((d) => isAllowedL3Department(d.name, d.code)) || userDepts[0] || null
    const primaryUserLoc = userLocs.find((ul) => ul.departmentId === primaryDept?.id) || userLocs[0]

    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        companyId: user.companyId,
        defaultLocationId: primaryUserLoc?.locId || user.defaultLocationId,
        department: primaryDept
          ? {
              id: primaryDept.id,
              code: primaryDept.code,
              name: primaryDept.name,
            }
          : null,
        jobCategory: primaryUserLoc?.jobCategory
          ? {
              id: primaryUserLoc.jobCategory.id,
              code: primaryUserLoc.jobCategory.code,
              name: primaryUserLoc.jobCategory.name,
            }
          : null,
        role: primaryUserLoc?.role?.name || authCtx.roles[0] || 'STAFF',
        profile: userWithAssoc.profile || null,
        assignedDepartments: userDepts.map((d) => ({ id: d.id, code: d.code, name: d.name })),
        isSuperAdmin: authCtx.isSuperAdmin,
      },
    })
  } catch (err) {
    console.error('Error fetching staff profile:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch staff profile' })
  }
}
