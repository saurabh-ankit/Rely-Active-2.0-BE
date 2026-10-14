import type { Request, Response } from 'express'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { Resource, UserLocationPermission } from '../../models/index.js'
import sequelize from '../../config/db/index.js'
import { parentKeyOf } from '../../config/permissions/resourceCatalog.js'
import { AuthorizationService } from '../../services/authorization.service.js'
import { normalizeGrants } from '../../services/permission.service.js'

/**
 * Active resources as a flat list in tree order: each module (by sortOrder) followed by
 * its sub-modules. `parentKey` is null for modules; the matrix nests rows by it.
 */
export async function getAllResources(_req: Request, res: Response): Promise<void> {
  try {
    const resources = await Resource.findAll({
      where: { isActive: true, isDeleted: false },
      order: [
        ['sortOrder', 'ASC'],
        ['name', 'ASC'],
      ],
    })

    const rows = resources.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      sortOrder: r.sortOrder,
      parentKey: parentKeyOf(r.key),
    }))
    const childrenOf = (parent: string | null) => rows.filter((r) => r.parentKey === parent)
    const ordered: typeof rows = []
    const walk = (parent: string | null) => {
      for (const row of childrenOf(parent)) {
        ordered.push(row)
        walk(row.key)
      }
    }
    walk(null)

    res.status(200).json({ success: true, data: ordered })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}

/** Only super admins manage permissions; anyone may read their own. */
const isSuperAdmin = async (req: Request) => {
  const userId = (req as AuthenticatedRequest).user?.id
  if (!userId) return false
  return (await AuthorizationService.getUserAuthorizationContext(userId)).isSuperAdmin
}

export async function getUserLocationPermissions(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.params.id as string
    const locationId = req.query.locationId as string

    if ((req as AuthenticatedRequest).user?.id !== userId && !(await isSuperAdmin(req))) {
      res.status(403).json({ success: false, message: "You cannot view another user's permissions" })
      return
    }

    if (!locationId) {
      res.status(400).json({ success: false, message: 'locationId query parameter is required' })
      return
    }

    const perms = await UserLocationPermission.findAll({
      where: {
        userId,
        locationId,
        isActive: true,
        isDeleted: false,
      },
    })

    res.status(200).json({
      success: true,
      data: perms,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}

export async function saveUserLocationPermissions(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.params.id as string
    const { locationId, permissions } = req.body

    if (!locationId || !Array.isArray(permissions)) {
      res.status(400).json({ success: false, message: 'locationId and permissions array are required' })
      return
    }

    if (!(await isSuperAdmin(req))) {
      res.status(403).json({ success: false, message: 'Only super admins can change permissions' })
      return
    }

    const operatingUserId = (req as AuthenticatedRequest).user?.id || null

    // Unknown keys are dropped; actions and parent `view` are filled in (see normalizeGrants).
    const known = await Resource.findAll({ where: { isActive: true, isDeleted: false }, attributes: ['key'] })
    const grants = normalizeGrants(permissions, new Set(known.map((r) => r.key)))

    await sequelize.transaction(async (transaction) => {
      await UserLocationPermission.destroy({ where: { userId, locationId }, transaction })
      if (grants.length) {
        await UserLocationPermission.bulkCreate(
          grants.map((g) => ({
            userId,
            locationId,
            resourceKey: g.resourceKey,
            permission: g.permission,
            isActive: true,
            isDeleted: false,
            createdBy: operatingUserId,
            updatedBy: operatingUserId,
          })),
          { transaction },
        )
      }
    })

    const updated = await UserLocationPermission.findAll({
      where: { userId, locationId, isActive: true, isDeleted: false },
    })

    res.status(200).json({
      success: true,
      message: 'Location permissions saved successfully',
      data: updated,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}
