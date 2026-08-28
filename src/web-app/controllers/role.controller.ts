import type { Request, Response } from 'express'
import { Role } from '../../models/index.js'

export async function getAllRoles(_req: Request, res: Response): Promise<void> {
  try {
    const roles = await Role.findAll({
      where: { isActive: true },
      order: [['name', 'ASC']],
    })

    res.status(200).json({
      success: true,
      data: roles,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}

export async function createRole(req: Request, res: Response): Promise<void> {
  try {
    const { name, code, description } = req.body

    if (!name || !code) {
      res.status(400).json({ success: false, message: 'name and code are required' })
      return
    }

    const formattedCode = code.toUpperCase().trim()

    const role = await Role.create({
      name: name.trim(),
      code: formattedCode,
      description: description || null,
      isSystem: false,
      isActive: true,
    })

    res.status(201).json({
      success: true,
      message: 'Role created successfully',
      data: role,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}
