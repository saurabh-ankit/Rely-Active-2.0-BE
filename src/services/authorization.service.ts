import { Permission, Role, RolePermission, User, UserPermission, UserRole } from '../models/index.js'

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
  userPermissions?: Array<UserPermission & { permission?: Permission }>
}

type RolePermissionWithPermission = RolePermission & {
  permission?: Permission
}

export class AuthorizationService {
  /** Resolves all active roles, permissions (RBAC + UBAC), and scopes for a user */
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
        {
          model: UserPermission,
          as: 'userPermissions',
          where: { isActive: true },
          required: false,
          include: [{ model: Permission, as: 'permission' }],
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
      companyId: ur.company_id,
      locationId: ur.location_id,
      departmentId: ur.department_id,
    }))

    // Fetch RBAC Permissions via Roles
    const roleIds = userRoles.map((ur) => ur.role_id).filter(Boolean)
    let rbacPermissionCodes: string[] = []

    if (roleIds.length > 0) {
      const rolePermissions = (await RolePermission.findAll({
        where: { role_id: roleIds },
        include: [{ model: Permission, as: 'permission' }],
      })) as RolePermissionWithPermission[]

      rbacPermissionCodes = rolePermissions.map((rp) => rp.permission?.code).filter((c): c is string => Boolean(c))
    }

    // Process UBAC Overrides
    const ubacOverrides = user.userPermissions || []
    const deniedCodes = new Set(
      ubacOverrides
        .filter((up) => up.effect === 'DENY')
        .map((up) => up.permission?.code)
        .filter(Boolean),
    )
    const allowedCodes = new Set(
      ubacOverrides
        .filter((up) => up.effect === 'ALLOW')
        .map((up) => up.permission?.code)
        .filter(Boolean),
    )

    // Combined Permission Set
    const finalPermissionsSet = new Set<string>()

    if (isSuperAdmin) {
      // Super Admin gets all active system permissions
      const allPermissions = await Permission.findAll({ where: { isActive: true } })
      allPermissions.forEach((p) => finalPermissionsSet.add(p.code))
    } else {
      // 1. Add RBAC permissions (unless explicitly denied by UBAC)
      for (const code of rbacPermissionCodes) {
        if (!deniedCodes.has(code)) {
          finalPermissionsSet.add(code)
        }
      }

      // 2. Add UBAC ALLOW permissions
      allowedCodes.forEach((code) => {
        if (code && !deniedCodes.has(code)) {
          finalPermissionsSet.add(code)
        }
      })
    }

    return {
      userId,
      isSuperAdmin,
      roles: roleCodes,
      permissions: Array.from(finalPermissionsSet),
      scopes,
    }
  }

  /** Evaluates whether a user is authorized for a specific permission code */
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

    // 1. SUPER_ADMIN bypass
    if (authCtx.isSuperAdmin) return true

    // 2. Explicit UBAC DENY check
    const user = (await User.findByPk(userId, {
      include: [
        {
          model: UserPermission,
          as: 'userPermissions',
          where: { isActive: true },
          include: [{ model: Permission, as: 'permission' }],
        },
      ],
    })) as UserWithRelations | null

    const ubacList = user?.userPermissions || []
    const ubacMatch = ubacList.find((up) => up.permission?.code === permissionCode)

    if (ubacMatch) {
      if (ubacMatch.effect === 'DENY') return false
      if (ubacMatch.effect === 'ALLOW') return true
    }

    // 3. RBAC Check
    if (!authCtx.permissions.includes(permissionCode)) {
      return false
    }

    // 4. Scope Validation if required
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
