import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { User, UserDetail } from '../../models/index.js'
import { generateToken } from '../../utils/jwt.js'
import { AuthorizationService } from '../../services/authorization.service.js'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      res.status(400).json({
        success: false,
        message: 'Please provide username and password.',
      })
      return
    }

    const trimmedUsername = (username as string).trim()

    const user = await User.findOne({
      where: {
        username: trimmedUsername,
        isDeleted: false,
      },
      include: [{ model: UserDetail, as: 'profile' }],
    })

    if (!user || !user.passwordHash) {
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

    const isMatch = await bcrypt.compare(password, user.passwordHash)
    if (!isMatch) {
      res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
      })
      return
    }

    const authCtx = await AuthorizationService.getUserAuthorizationContext(user.id)

    const token = generateToken({
      userId: user.id,
      email: user.email,
      companyId: user.companyId,
      defaultLocationId: user.defaultLocationId,
      roles: authCtx.roles,
    })

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          phone: user.phone,
          companyId: user.companyId,
          defaultLocationId: user.defaultLocationId,
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
      include: [{ model: UserDetail, as: 'profile' }],
    })

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }

    const authCtx = await AuthorizationService.getUserAuthorizationContext(user.id)

    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        companyId: user.companyId,
        defaultLocationId: user.defaultLocationId,
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
