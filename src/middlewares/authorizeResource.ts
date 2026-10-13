import type { NextFunction, Request, Response } from 'express'
import type { ResourceKey } from '../config/permissions/resourceCatalog.js'
import { getPermissionSet, type PermissionAction, type PermissionSet } from '../services/permission.service.js'
import type { AuthenticatedRequest } from './authenticate.js'

/** The property a request acts on: route param, query, then the x-location-id header (via authenticate). */
export const resolveLocationId = (req: Request): string | null => {
  const r = req as AuthenticatedRequest
  const pick = (v: unknown) => (typeof v === 'string' && v ? v : null)
  return (
    pick(req.params.locationId) ||
    pick(req.params.locId) ||
    pick(req.query.locationId) ||
    pick(req.query.locId) ||
    r.user?.defaultLocationId ||
    null
  )
}

/** One permission lookup per request and property. */
async function permissionsFor(req: Request): Promise<PermissionSet | null> {
  const r = req as AuthenticatedRequest & { _permissionSets?: Map<string, PermissionSet> }
  if (!r.user?.id || r.user.residentId) return null
  const locationId = resolveLocationId(req)
  const cacheKey = locationId ?? ''
  r._permissionSets ??= new Map()
  if (!r._permissionSets.has(cacheKey)) r._permissionSets.set(cacheKey, await getPermissionSet(r.user.id, locationId))
  return r._permissionSets.get(cacheKey)!
}

const deny = (res: Response, keys: readonly string[], action: PermissionAction) =>
  res.status(403).json({
    success: false,
    message: `You do not have ${action} access to ${keys.join(' / ')} for this property.`,
  })

/** Allow the request if the user can do `action` on any of `keys` at the request's property. */
export const authorizeResource =
  (keys: ResourceKey | readonly ResourceKey[], action: PermissionAction) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const list = (Array.isArray(keys) ? keys : [keys]) as readonly ResourceKey[]
      const perms = await permissionsFor(req)
      if (perms && list.some((k) => perms.can(k, action))) return next()
      deny(res, list, action)
    } catch (err) {
      next(err)
    }
  }

const METHOD_ACTION: Record<string, PermissionAction> = {
  GET: 'view',
  HEAD: 'view',
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
}

export interface ResourceGuardRule {
  /** Matches the path inside the router (string = prefix of a path segment). */
  match: string | RegExp
  /** Required for writes, and for reads unless `readKeys` is set. Any one of them is enough. */
  keys: ResourceKey | readonly ResourceKey[]
  /** Reads of shared reference data (e.g. dish or vendor lists used by several tabs). */
  readKeys?: ResourceKey | readonly ResourceKey[]
  /** Overrides the action derived from the HTTP method. */
  action?: PermissionAction
}

const matches = (rule: ResourceGuardRule, path: string) =>
  typeof rule.match === 'string' ? path === rule.match || path.startsWith(`${rule.match}/`) : rule.match.test(path)

/**
 * Router-level guard: picks the resource from the path (first matching rule, else
 * `fallback`) and the action from the HTTP method (GET view, POST create, PUT/PATCH
 * update, DELETE delete). Mount after `authenticate`.
 */
export const resourceGuard =
  (rules: ResourceGuardRule[], fallback: ResourceGuardRule['keys']) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rule = rules.find((r) => matches(r, req.path))
      const method = req.method.toUpperCase()
      const action = rule?.action ?? METHOD_ACTION[method] ?? 'view'
      const raw = rule ? (action === 'view' && rule.readKeys ? rule.readKeys : rule.keys) : fallback
      const keys = (Array.isArray(raw) ? raw : [raw]) as readonly ResourceKey[]
      const perms = await permissionsFor(req)
      if (perms && keys.some((k) => perms.can(k, action))) return next()
      deny(res, keys, action)
    } catch (err) {
      next(err)
    }
  }
