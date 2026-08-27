import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import {
  Permission,
  Property,
  Role,
  User,
  UserPermission,
  UserProfile,
  UserProperty,
  UserRole,
} from '../../models/index.js'
import { AuthorizationService } from '../../services/authorization.service.js'

export async function getAllUsers(_req: Request, res: Response): Promise<void> {
  try {
    const users = await User.findAll({
      where: { isDeleted: false },
      include: [
        { model: UserProfile, as: 'profile' },
        {
          model: UserRole,
          as: 'userRoles',
          include: [{ model: Role, as: 'role' }],
        },
        {
          model: UserPermission,
          as: 'userPermissions',
          include: [{ model: Permission, as: 'permission' }],
        },
        {
          model: Property,
          as: 'assignedProperties',
          through: { attributes: [] },
        },
      ],
      order: [['createdAt', 'DESC']],
    })

    res.status(200).json({
      success: true,
      data: users,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}

export async function getUserById(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const user = await User.findByPk(id, {
      include: [
        { model: UserProfile, as: 'profile' },
        {
          model: UserRole,
          as: 'userRoles',
          include: [{ model: Role, as: 'role' }],
        },
        {
          model: UserPermission,
          as: 'userPermissions',
          include: [{ model: Permission, as: 'permission' }],
        },
        {
          model: Property,
          as: 'assignedProperties',
          through: { attributes: [] },
        },
      ],
    })

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }

    const authCtx = await AuthorizationService.getUserAuthorizationContext(user.id)

    res.status(200).json({
      success: true,
      data: {
        ...user.toJSON(),
        authorizationContext: authCtx,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}

export async function createUser(req: Request, res: Response): Promise<void> {
  try {
    const {
      email,
      phone,
      password,
      companyId,
      defaultLocationId,
      departmentId,
      first_name,
      last_name,
      designation,
      employee_code,
      roleCode,
      propertyIds,
    } = req.body

    if (!first_name || (!email && !phone)) {
      res.status(400).json({
        success: false,
        message: 'first_name and email or phone are required.',
      })
      return
    }

    const defaultPassword = password || 'Password@123'
    const hashedPassword = await bcrypt.hash(defaultPassword, 10)

    const user = await User.create({
      email: email ? email.trim() : null,
      phone: phone ? phone.trim() : null,
      password_hash: hashedPassword,
      company_id: companyId || null,
      default_location_id: defaultLocationId || null,
      status: 'ACTIVE',
      isActive: true,
    })

    await UserProfile.create({
      user_id: user.id,
      first_name: first_name.trim(),
      last_name: last_name ? last_name.trim() : null,
      designation: designation || null,
      employee_code: employee_code || null,
    })

    if (roleCode) {
      const targetRole = await Role.findOne({ where: { code: roleCode } })
      if (targetRole) {
        await UserRole.create({
          user_id: user.id,
          role_id: targetRole.id,
          company_id: companyId || null,
          location_id: defaultLocationId || null,
          department_id: departmentId || null,
        })
      }
    }

    // Insert user_properties mapping
    if (propertyIds && Array.isArray(propertyIds)) {
      for (const pId of propertyIds) {
        await UserProperty.create({
          user_id: user.id,
          property_id: pId,
        })
      }
    }

    const createdUser = await User.findByPk(user.id, {
      include: [
        { model: UserProfile, as: 'profile' },
        { model: UserRole, as: 'userRoles', include: [{ model: Role, as: 'role' }] },
        { model: Property, as: 'assignedProperties', through: { attributes: [] } },
      ],
    })

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: createdUser,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}

export async function getUserAccessibleProperties(req: Request, res: Response): Promise<void> {
  try {
    const reqWithAuth = req as Request & { authContext?: { isSuperAdmin: boolean }; userId?: string }
    const authCtx = reqWithAuth.authContext
    const userId = reqWithAuth.userId || ''

    if (authCtx?.isSuperAdmin) {
      // Super Admin automatically gets access to ALL properties
      const allProperties = await Property.findAll({
        order: [['property_name', 'ASC']],
      })
      res.status(200).json({
        success: true,
        data: allProperties,
      })
      return
    }

    // Regular users: Fetch properties mapped in user_properties
    const user = (await User.findByPk(userId, {
      include: [
        {
          model: Property,
          as: 'assignedProperties',
          through: { attributes: [] },
        },
      ],
    })) as (User & { assignedProperties?: Property[] }) | null

    const assigned = user?.assignedProperties || []
    if (assigned.length > 0) {
      res.status(200).json({
        success: true,
        data: assigned,
      })
      return
    }

    // Fallback: If no explicit mapping, return all active properties
    const fallbackProperties = await Property.findAll({
      order: [['property_name', 'ASC']],
    })
    res.status(200).json({
      success: true,
      data: fallbackProperties,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}

export async function updateUserProperties(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.params.id as string
    const { propertyIds } = req.body

    await UserProperty.destroy({ where: { user_id: userId } })

    if (propertyIds && Array.isArray(propertyIds)) {
      for (const pId of propertyIds) {
        await UserProperty.create({
          user_id: userId,
          property_id: pId,
        })
      }
    }

    res.status(200).json({
      success: true,
      message: 'User properties updated successfully',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}

export async function assignUserRole(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.params.id as string
    const { roleId, roleCode, companyId, locationId, departmentId } = req.body

    let targetRole = null
    if (roleId) targetRole = await Role.findByPk(roleId)
    else if (roleCode) targetRole = await Role.findOne({ where: { code: roleCode } })

    if (!targetRole) {
      res.status(400).json({ success: false, message: 'Valid roleId or roleCode is required' })
      return
    }

    const userRole = await UserRole.create({
      user_id: userId,
      role_id: targetRole.id,
      company_id: companyId || null,
      location_id: locationId || null,
      department_id: departmentId || null,
      isActive: true,
    })

    res.status(200).json({
      success: true,
      message: 'Role assigned to user successfully',
      data: userRole,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}

export async function assignUserPermission(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.params.id as string
    const { permissionId, permissionCode, effect, companyId, locationId, departmentId, reason } = req.body

    let targetPerm = null
    if (permissionId) targetPerm = await Permission.findByPk(permissionId)
    else if (permissionCode) targetPerm = await Permission.findOne({ where: { code: permissionCode } })

    if (!targetPerm) {
      res.status(400).json({ success: false, message: 'Valid permissionId or permissionCode is required' })
      return
    }

    const userPerm = await UserPermission.create({
      user_id: userId,
      permission_id: targetPerm.id,
      effect: effect === 'DENY' ? 'DENY' : 'ALLOW',
      company_id: companyId || null,
      location_id: locationId || null,
      department_id: departmentId || null,
      reason: reason || null,
      isActive: true,
    })

    res.status(200).json({
      success: true,
      message: `User UBAC permission override (${effect}) created successfully`,
      data: userPerm,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}

export async function updateUserPermissions(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.params.id as string
    const { permissionIds } = req.body

    const user = await User.findByPk(userId)
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }

    // Clear existing user-level UBAC permissions
    await UserPermission.destroy({ where: { user_id: userId } })

    // Create new user UBAC permissions
    if (permissionIds && Array.isArray(permissionIds)) {
      for (const pId of permissionIds) {
        await UserPermission.create({
          user_id: userId,
          permission_id: pId,
          effect: 'ALLOW',
          isActive: true,
        })
      }
    }

    const authCtx = await AuthorizationService.getUserAuthorizationContext(userId)

    res.status(200).json({
      success: true,
      message: 'User permissions updated successfully',
      data: {
        userId,
        authorizationContext: authCtx,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}
