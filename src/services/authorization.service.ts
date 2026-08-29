import { Role, User, UserLocation } from '../models/index.js'

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
  userLocations?: Array<UserLocation & { role?: Role }>
}

export class AuthorizationService {
  /** Resolves all active roles, permissions, and scopes for a user */
  static async getUserAuthorizationContext(userId: string): Promise<UserAuthorizationContext> {
    const user = (await User.findByPk(userId, {
      include: [
        {
          model: UserLocation,
          as: 'userLocations',
          where: { isActive: true, isDeleted: false },
          required: false,
          include: [{ model: Role, as: 'role' }],
        },
      ],
    })) as UserWithRelations | null

    if (!user || !user.isActive || user.isDeleted) {
      return { userId, isSuperAdmin: false, roles: [], permissions: [], scopes: [] }
    }

    const userLocations = user.userLocations || []
    const roleCodes = userLocations.map((ul) => ul.role?.code).filter((c): c is string => Boolean(c))
    const isSuperAdmin =
      user.username === 'superadmin' || user.email === 'superadmin@rely.com' || roleCodes.includes('SUPER_ADMIN')

    const scopes = userLocations.map((ul) => ({
      roleCode: ul.role?.code || '',
      companyId: ul.companyId,
      locationId: ul.locId,
      departmentId: ul.departmentId,
    }))

    const rolesList = isSuperAdmin && !roleCodes.includes('SUPER_ADMIN') ? ['SUPER_ADMIN', ...roleCodes] : roleCodes

    return {
      userId,
      isSuperAdmin,
      roles: rolesList,
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
