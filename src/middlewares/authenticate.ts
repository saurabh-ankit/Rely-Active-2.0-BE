import type { NextFunction, Request, Response } from 'express'
import { verifyToken } from '../utils/jwt.js'
import { User } from '../models/index.js'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email?: string | null
    companyId?: string | null
    defaultLocationId?: string | null
    roles: string[]
  }
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

    const user = await User.findByPk(decoded.userId)
    if (!user || !user.isActive || user.isDeleted) {
      res.status(401).json({
        success: false,
        message: 'Invalid token or user account deactivated.',
      })
      return
    }

    req.user = {
      id: user.id,
      email: user.email,
      companyId: user.company_id,
      defaultLocationId: user.default_location_id,
      roles: decoded.roles || [],
    }

    next()
  } catch {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication token.',
    })
  }
}
