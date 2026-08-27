import type { Request, Response } from 'express'
import { Module, Permission } from '../../models/index.js'

export async function getAllPermissions(_req: Request, res: Response): Promise<void> {
  try {
    const permissions = await Permission.findAll({
      where: { isActive: true },
      include: [{ model: Module, as: 'module' }],
      order: [
        ['module_id', 'ASC'],
        ['code', 'ASC'],
      ],
    })

    const modules = await Module.findAll({
      where: { isActive: true },
      include: [{ model: Permission, as: 'permissions' }],
      order: [['createdAt', 'ASC']],
    })

    res.status(200).json({
      success: true,
      data: {
        permissions,
        modules,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}

export async function getModules(_req: Request, res: Response): Promise<void> {
  try {
    const modules = await Module.findAll({
      where: { isActive: true },
      include: [{ model: Permission, as: 'permissions' }],
      order: [['createdAt', 'ASC']],
    })

    res.status(200).json({
      success: true,
      data: modules,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}
