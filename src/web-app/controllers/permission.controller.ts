import type { Request, Response } from 'express'
import { Resource } from '../../models/index.js'

export async function getAllPermissions(_req: Request, res: Response): Promise<void> {
  try {
    const resources = await Resource.findAll({
      where: { isActive: true },
      order: [['name', 'ASC']],
    })

    res.status(200).json({
      success: true,
      data: {
        permissions: resources,
        modules: resources,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}

export async function getModules(_req: Request, res: Response): Promise<void> {
  try {
    const resources = await Resource.findAll({
      where: { isActive: true },
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
