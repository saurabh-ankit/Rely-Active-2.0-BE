import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { User, UserProfile } from '../../models/index.js'
import { generateToken } from '../../utils/jwt.js'
import { AuthorizationService } from '../../services/authorization.service.js'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, phone, password } = req.body

    if ((!email && !phone) || !password) {
      res.status(400).json({
        success: false,
        message: 'Please provide email or phone and password.',
      })
      return
    }

    const whereClause: Record<string, unknown> = { isDeleted: false }
    if (email) whereClause.email = (email as string).trim()
    else if (phone) whereClause.phone = (phone as string).trim()

    const user = await User.findOne({
      where: whereClause,
      include: [{ model: UserProfile, as: 'profile' }],
    })

    if (!user || !user.password_hash) {
      res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      })
      return
    }

    if (user.status !== 'ACTIVE' || !user.isActive) {
      res.status(403).json({
        success: false,
        message: 'Your account is pending approval or inactive.',
      })
      return
    }

    const isMatch = await bcrypt.compare(password, user.password_hash)
    if (!isMatch) {
      res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      })
      return
    }

    const authCtx = await AuthorizationService.getUserAuthorizationContext(user.id)

    // Enforce web console restriction: Only Super Admin and Property Admin can log in!
    const isAllowedRole = authCtx.isSuperAdmin || authCtx.roles.includes('ADMIN')
    if (!isAllowedRole) {
      res.status(403).json({
        success: false,
        message: 'Access Denied: Only Super Admin and Property Admin users can log into the web operations console.',
      })
      return
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      companyId: user.company_id,
      defaultLocationId: user.default_location_id,
      roles: authCtx.roles,
    })

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          companyId: user.company_id,
          defaultLocationId: user.default_location_id,
          profile: (user as User & { profile?: unknown }).profile,
          isSuperAdmin: authCtx.isSuperAdmin,
          roles: authCtx.roles,
          permissions: authCtx.permissions,
        },
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error during login'
    res.status(500).json({
      success: false,
      message,
    })
  }
}

export async function getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, message: 'Authentication required' })
      return
    }

    const user = await User.findByPk(req.user.id, {
      include: [{ model: UserProfile, as: 'profile' }],
    })

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }

    const authCtx = await AuthorizationService.getUserAuthorizationContext(user.id)

    const isAllowedRole = authCtx.isSuperAdmin || authCtx.roles.includes('ADMIN')
    if (!isAllowedRole) {
      res.status(403).json({
        success: false,
        message: 'Access Denied: Only Super Admin and Property Admin users can access the web operations console.',
      })
      return
    }

    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        companyId: user.company_id,
        defaultLocationId: user.default_location_id,
        profile: (user as User & { profile?: unknown }).profile,
        isSuperAdmin: authCtx.isSuperAdmin,
        roles: authCtx.roles,
        permissions: authCtx.permissions,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error fetching user profile'
    res.status(500).json({
      success: false,
      message,
    })
  }
}
