import { Role, User, UserRole } from '../models/index.js'

export interface UserAuthorizationContext {
  userId: string
  isSuperAdmin: boolean
  roles: string[]
  permissions: string[]
  scopes: Array<{
    roleCode: string
    companyId?: string | null
    locationId?: string | null
    departmentId?: string | null
  }>
}

type UserWithRelations = User & {
  userRoles?: Array<UserRole & { role?: Role }>
}

export class AuthorizationService {
  /** Resolves all active roles, permissions, and scopes for a user */
  static async getUserAuthorizationContext(userId: string): Promise<UserAuthorizationContext> {
    const user = (await User.findByPk(userId, {
      include: [
        {
          model: UserRole,
          as: 'userRoles',
          where: { isActive: true },
          required: false,
          include: [{ model: Role, as: 'role' }],
        },
      ],
    })) as UserWithRelations | null

    if (!user || !user.isActive || user.isDeleted) {
      return { userId, isSuperAdmin: false, roles: [], permissions: [], scopes: [] }
    }

    const userRoles = user.userRoles || []
    const roleCodes = userRoles.map((ur) => ur.role?.code).filter((c): c is string => Boolean(c))
    const isSuperAdmin = roleCodes.includes('SUPER_ADMIN')

    const scopes = userRoles.map((ur) => ({
      roleCode: ur.role?.code || '',
      companyId: ur.companyId,
      locationId: ur.locationId,
      departmentId: ur.departmentId,
    }))

    return {
      userId,
      isSuperAdmin,
      roles: roleCodes,
      permissions: isSuperAdmin ? ['*'] : [],
      scopes,
    }
  }

  /** Evaluates whether a user is authorized for a specific role or action */
  static async hasPermission(
    userId: string,
    permissionCode: string,
    contextScope?: {
      companyId?: string | undefined
      locationId?: string | undefined
      departmentId?: string | undefined
    },
  ): Promise<boolean> {
    const authCtx = await this.getUserAuthorizationContext(userId)

    if (authCtx.isSuperAdmin) return true

    if (contextScope && authCtx.scopes.length > 0) {
      const scopeMatches = authCtx.scopes.some((sc) => {
        if (sc.companyId && contextScope.companyId && sc.companyId !== contextScope.companyId) return false
        if (sc.locationId && contextScope.locationId && sc.locationId !== contextScope.locationId) return false
        if (sc.departmentId && contextScope.departmentId && sc.departmentId !== contextScope.departmentId) return false
        return true
      })
      if (!scopeMatches) return false
    }

    return true
  }
}
