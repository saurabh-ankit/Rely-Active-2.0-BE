import type { Request, Response } from 'express'
import { Permission, Role, RolePermission } from '../../models/index.js'

export async function getAllRoles(_req: Request, res: Response): Promise<void> {
  try {
    const roles = await Role.findAll({
      where: { isActive: true },
      include: [
        {
          model: Permission,
          as: 'permissions',
          through: { attributes: [] },
        },
      ],
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
    const { name, code, description, permissionIds } = req.body

    if (!name || !code) {
      res.status(400).json({ success: false, message: 'name and code are required' })
      return
    }

    const formattedCode = code.toUpperCase().trim()

    const role = await Role.create({
      name: name.trim(),
      code: formattedCode,
      description: description || null,
      is_system: false,
      isActive: true,
    })

    if (permissionIds && Array.isArray(permissionIds)) {
      for (const pId of permissionIds) {
        await RolePermission.findOrCreate({
          where: { role_id: role.id, permission_id: pId },
          defaults: { role_id: role.id, permission_id: pId },
        })
      }
    }

    const createdRole = await Role.findByPk(role.id, {
      include: [{ model: Permission, as: 'permissions' }],
    })

    res.status(201).json({
      success: true,
      message: 'Role created successfully',
      data: createdRole,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}

export async function updateRolePermissions(req: Request, res: Response): Promise<void> {
  try {
    const roleId = req.params.id as string
    const { permissionIds } = req.body

    const role = await Role.findByPk(roleId)
    if (!role) {
      res.status(404).json({ success: false, message: 'Role not found' })
      return
    }

    // Clear existing permissions and assign new ones
    await RolePermission.destroy({ where: { role_id: roleId } })

    if (permissionIds && Array.isArray(permissionIds)) {
      for (const pId of permissionIds) {
        await RolePermission.create({
          role_id: roleId,
          permission_id: pId,
        })
      }
    }

    const updatedRole = await Role.findByPk(roleId, {
      include: [{ model: Permission, as: 'permissions' }],
    })

    res.status(200).json({
      success: true,
      message: 'Role permissions updated successfully',
      data: updatedRole,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}
