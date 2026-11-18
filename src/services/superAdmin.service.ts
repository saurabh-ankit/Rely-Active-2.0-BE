import type { Transaction } from 'sequelize'
import { EmployeeManager, Property, Role, User, UserLocation } from '../models/index.js'
import { AuthorizationService } from './authorization.service.js'
import { HttpError } from '../middlewares/error/http-error.js'

export const SUPER_ADMIN_ROLE_CODE = 'SUPER_ADMIN'
/** The seeded account stays a super admin for good, so there is always one to fall back on. */
export const SEEDED_SUPER_ADMIN_USERNAME = 'superadmin'
export const SEEDED_SUPER_ADMIN_EMAIL = 'superadmin@rely.com'

export const isSuperAdminRoleCode = (code?: string | null) => (code || '').toUpperCase() === SUPER_ADMIN_ROLE_CODE

export const isSeededSuperAdmin = (user?: { username?: string | null; email?: string | null } | null) =>
  !!user && (user.username === SEEDED_SUPER_ADMIN_USERNAME || user.email === SEEDED_SUPER_ADMIN_EMAIL)

export async function isUserSuperAdmin(userId?: string | null): Promise<boolean> {
  if (!userId) return false
  return (await AuthorizationService.getUserAuthorizationContext(userId)).isSuperAdmin
}

/** Only super admins may grant, change or remove the super admin role. */
export async function assertCallerIsSuperAdmin(callerId?: string | null): Promise<void> {
  if (!(await isUserSuperAdmin(callerId))) {
    throw new HttpError(403, 'Only a Super Admin can create or change Super Admin accounts.')
  }
}

/**
 * Checks a super admin may be moved to another role: never the seeded account, never yourself,
 * and never the last active super admin.
 */
export async function assertCanDemoteSuperAdmin(
  target: { id: string; username?: string | null; email?: string | null },
  callerId?: string | null,
): Promise<void> {
  if (isSeededSuperAdmin(target)) {
    throw new HttpError(400, 'The default Super Admin account cannot be changed to another role.')
  }
  if (callerId && target.id === callerId) {
    throw new HttpError(400, 'You cannot remove the Super Admin role from your own account.')
  }
  const role = await Role.findOne({ where: { code: SUPER_ADMIN_ROLE_CODE } })
  const others = role
    ? await UserLocation.findAll({
        where: { roleId: role.id, isActive: true, isDeleted: false },
        attributes: ['userId'],
        include: [{ model: User, as: 'user', attributes: [], where: { isActive: true, isDeleted: false } }],
      })
    : []
  const seeded = await User.findOne({
    where: { username: SEEDED_SUPER_ADMIN_USERNAME, isActive: true, isDeleted: false },
    attributes: ['id'],
  })
  const remaining = new Set(others.map((ul) => ul.userId))
  if (seeded) remaining.add(seeded.id)
  remaining.delete(target.id)
  if (remaining.size === 0) {
    throw new HttpError(400, 'At least one active Super Admin must remain.')
  }
}

/** Gives a super admin a SUPER_ADMIN row for every property, replacing their old rows and managers. */
export async function syncSuperAdminLocations(
  userId: string,
  operatingUserId: string | null,
  transaction?: Transaction,
): Promise<void> {
  const tx = transaction ? { transaction } : {}
  const role = await Role.findOne({ where: { code: SUPER_ADMIN_ROLE_CODE }, ...tx })
  if (!role) throw new HttpError(500, 'SUPER_ADMIN role is missing. Run the seeder.')
  const properties = await Property.findAll({ where: { isDeleted: false }, attributes: ['id', 'companyId'], ...tx })

  await UserLocation.destroy({ where: { userId }, force: true, ...tx })
  await EmployeeManager.destroy({ where: { userId }, force: true, ...tx })
  for (const prop of properties) {
    await UserLocation.create(
      {
        userId,
        locId: prop.id,
        roleId: role.id,
        companyId: prop.companyId || null,
        departmentId: null,
        jobCategoryId: null,
        createdBy: operatingUserId,
        updatedBy: operatingUserId,
      },
      tx,
    )
  }
}
