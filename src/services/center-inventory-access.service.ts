import { Property, UserLocationPermission } from '../models/index.js'
import { AuthorizationService } from './authorization.service.js'
import { InventoryError } from './inventory.service.js'
export type InventoryAction = 'view' | 'create' | 'update' | 'delete'
export async function inventoryAccess(userId: string, locationId: string) {
  const [ctx, property] = await Promise.all([
    AuthorizationService.getUserAuthorizationContext(userId),
    Property.findOne({ where: { id: locationId, isActive: true, isDeleted: false } }),
  ])
  if (!property) throw new InventoryError(404, 'Property not found')
  const scopes = ctx.scopes.filter(
    (s) =>
      !['RESIDENT', 'FAMILY_MEMBER'].includes(s.roleCode) &&
      (s.locationId === locationId || (!s.locationId && s.companyId === property.companyId)),
  )
  if (!ctx.isSuperAdmin && !scopes.length) throw new InventoryError(403, 'You do not have access to this property')
  const permissions = ctx.isSuperAdmin
    ? []
    : await UserLocationPermission.findAll({
        where: { userId, locationId, resourceKey: 'INVENTORY', isActive: true, isDeleted: false },
      })
  const can = (action: InventoryAction) => ctx.isSuperAdmin || permissions.some((p) => p.permission === action)
  return {
    view: can('view'),
    create: can('create'),
    update: can('update'),
    delete: can('delete'),
    approve: ctx.isSuperAdmin,
    autoApprove: ctx.isSuperAdmin || scopes.some((s) => s.roleCode === 'ADMIN'),
  }
}
export async function requireInventoryAccess(userId: string, locationId: string, action: InventoryAction) {
  const access = await inventoryAccess(userId, locationId)
  if (!access[action]) throw new InventoryError(403, `Inventory ${action} permission is required for this property`)
  return access
}
