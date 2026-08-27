import type { Request, Response } from 'express'
import { Resource, UserLocationPermission } from '../../models/index.js'

export async function getAllResources(_req: Request, res: Response): Promise<void> {
  try {
    const resources = await Resource.findAll({
      where: { isActive: true, isDeleted: false },
      order: [['name', 'ASC']],
    })

    res.status(200).json({
      success: true,
      data: resources,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}

export async function getUserLocationPermissions(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.params.id as string
    const locationId = req.query.locationId as string

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

    // Delete existing permissions for this user and location
    await UserLocationPermission.destroy({
      where: { userId, locationId },
    })

    // Bulk insert new permissions
    for (const p of permissions) {
      await UserLocationPermission.create({
        userId,
        locationId,
        resourceKey: p.resourceKey,
        permission: p.permission,
        isActive: true,
        isDeleted: false,
      })
    }

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
