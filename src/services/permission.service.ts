import { UserLocationPermission } from '../models/index.js'
import { flattenCatalog, parentKeyOf } from '../config/permissions/resourceCatalog.js'
import { AuthorizationService } from './authorization.service.js'

export type PermissionAction = 'view' | 'create' | 'update' | 'delete'

/** Actions build on each other: having one implies having every action before it. */
export const PERMISSION_ACTIONS: PermissionAction[] = ['view', 'create', 'update', 'delete']

/**
 * Department staff get their department's module without explicit grants. This mirrors
 * the frontend's department-manager shortcuts (src/hooks/useLocation.ts) so screens and
 * APIs agree. Matched on department code, or on the name like the frontend does.
 */
const departmentModules = (code: string, name: string): string[] => {
  const c = code.toUpperCase()
  const n = name.toUpperCase()
  if (c === 'RNM' || n.includes('REPAIR') || n.includes('MAINTENANCE') || n.includes('R&M')) return ['TICKETS']
  if (c === 'CON' || n.includes('CONCIERGE')) return ['TICKETS']
  if (c === 'FNB' || n.includes('FOOD') || n.includes('BEVERAGE') || n.includes('F&B')) return ['FNB']
  if (c === 'EVT' || c === 'EVENT' || c === 'EVENTS' || n.includes('EVENT')) return ['EVENTS']
  if (c === 'SEC' || c === 'GNS' || c === 'SECURITY' || n.includes('GATE') || n.includes('SECURITY')) return ['GNS']
  if (c === 'HK' || n.includes('HOUSEKEEPING')) return ['ROSTER', 'EMPLOYEE']
  return []
}

const rootOf = (key: string) => key.split('.')[0]!

/** Module → its sub-module keys, from the catalogue. */
const SECTIONS = flattenCatalog().reduce<Map<string, string[]>>((map, row) => {
  if (row.parentKey) map.set(row.parentKey, [...(map.get(row.parentKey) || []), row.key])
  return map
}, new Map())

export interface PermissionSet {
  isSuperAdmin: boolean
  /** The user holds this exact grant (or it comes from their department / super admin). */
  has: (key: string, action: PermissionAction) => boolean
  /** Effective access: the grant, plus `view` on every parent module. */
  can: (key: string, action: PermissionAction) => boolean
}

/** A user's permissions at one property. */
export async function getPermissionSet(userId: string, locationId: string | null): Promise<PermissionSet> {
  const ctx = await AuthorizationService.getUserAuthorizationContext(userId)
  if (ctx.isSuperAdmin) return { isSuperAdmin: true, has: () => true, can: () => true }
  if (!locationId) return { isSuperAdmin: false, has: () => false, can: () => false }

  const rows = await UserLocationPermission.findAll({
    where: { userId, locationId, isActive: true, isDeleted: false },
    attributes: ['resourceKey', 'permission'],
  })
  const granted = new Set(rows.map((r) => `${r.resourceKey}:${r.permission}`))

  const deptModules = new Set(
    ctx.scopes
      .filter((s) => !s.locationId || s.locationId === locationId)
      .flatMap((s) => departmentModules(s.departmentCode || '', s.departmentName || '')),
  )

  const has = (key: string, action: PermissionAction) => granted.has(`${key}:${action}`) || deptModules.has(rootOf(key))
  const can = (key: string, action: PermissionAction): boolean => {
    if (!has(key, action)) return false
    // Viewing a module that has sections needs View on at least one of them: a module
    // whose sections are all "None" is closed.
    const sections = SECTIONS.get(key)
    if (action === 'view' && sections?.length && !sections.some((k) => has(k, 'view'))) return false
    const parent = parentKeyOf(key)
    return parent ? can(parent, 'view') : true
  }
  return { isSuperAdmin: false, has, can }
}

/**
 * Make a set of grants consistent before saving:
 * - drop unknown keys,
 * - each action brings the actions before it (update ⇒ view + create),
 * - any grant on a sub-module brings `view` on its parent module(s),
 * - a module whose sections are all off has no access itself.
 */
export function normalizeGrants(
  grants: Array<{ resourceKey: string; permission: string }>,
  knownKeys: Set<string>,
): Array<{ resourceKey: string; permission: PermissionAction }> {
  const out = new Set<string>()
  const add = (key: string, action: PermissionAction) => {
    const index = PERMISSION_ACTIONS.indexOf(action)
    PERMISSION_ACTIONS.slice(0, index + 1).forEach((a) => out.add(`${key}:${a}`))
    const parent = parentKeyOf(key)
    if (parent && knownKeys.has(parent)) add(parent, 'view')
  }
  for (const g of grants) {
    if (!knownKeys.has(g.resourceKey)) continue
    if (!PERMISSION_ACTIONS.includes(g.permission as PermissionAction)) continue
    add(g.resourceKey, g.permission as PermissionAction)
  }
  // A module with sections but none of them open is closed: drop the module's own grants.
  for (const key of knownKeys) {
    const sections = [...knownKeys].filter((k) => parentKeyOf(k) === key)
    if (sections.length && !sections.some((k) => out.has(`${k}:view`))) {
      PERMISSION_ACTIONS.forEach((a) => out.delete(`${key}:${a}`))
    }
  }
  return [...out].map((entry) => {
    const at = entry.lastIndexOf(':')
    return { resourceKey: entry.slice(0, at), permission: entry.slice(at + 1) as PermissionAction }
  })
}
