import { Property } from '../models/index.js'
import { getPermissionSet } from './permission.service.js'
import { AuthorizationService } from './authorization.service.js'
import { InventoryError } from './inventory.service.js'
export type InventoryAction = 'view' | 'create' | 'update' | 'delete'

/** The Inventory module and its sub-modules (tabs). */
export const INVENTORY_SECTIONS = [
  'INVENTORY.ITEMS',
  'INVENTORY.SUPPLIERS',
  'INVENTORY.PURCHASE_ORDERS',
  'INVENTORY.TRANSACTIONS',
] as const
export type InventoryResource = 'INVENTORY' | (typeof INVENTORY_SECTIONS)[number]
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
  const perms = await getPermissionSet(userId, locationId)
  const flags = (key: InventoryResource) => ({
    view: perms.can(key, 'view'),
    create: perms.can(key, 'create'),
    update: perms.can(key, 'update'),
    delete: perms.can(key, 'delete'),
  })
  return {
    ...flags('INVENTORY'),
    /** Per-tab access (Categories, Items, Suppliers, Purchase Orders, Transactions). */
    sections: Object.fromEntries(INVENTORY_SECTIONS.map((key) => [key, flags(key)])) as Record<
      InventoryResource,
      ReturnType<typeof flags>
    >,
    approve: ctx.isSuperAdmin,
    autoApprove: ctx.isSuperAdmin || scopes.some((s) => s.roleCode === 'ADMIN'),
  }
}
export async function requireInventoryAccess(
  userId: string,
  locationId: string,
  action: InventoryAction,
  resource: InventoryResource = 'INVENTORY',
) {
  const access = await inventoryAccess(userId, locationId)
  const allowed = resource === 'INVENTORY' ? access[action] : access.sections[resource]?.[action]
  if (!allowed) {
    const name =
      resource === 'INVENTORY' ? 'Inventory' : resource.replace('INVENTORY.', '').replace('_', ' ').toLowerCase()
    throw new InventoryError(403, `Inventory ${name} ${action} permission is required for this property`)
  }
  return access
}
