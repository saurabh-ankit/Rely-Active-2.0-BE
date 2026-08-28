import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { Property, Role, User, UserDetail, UserLocation, UserRole } from '../../models/index.js'
import { AuthorizationService } from '../../services/authorization.service.js'

export async function getAllUsers(_req: Request, res: Response): Promise<void> {
  try {
    const users = await User.findAll({
      where: { isDeleted: false },
      include: [
        { model: UserDetail, as: 'profile' },
        {
          model: UserRole,
          as: 'userRoles',
          include: [{ model: Role, as: 'role' }],
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
        { model: UserDetail, as: 'profile' },
        {
          model: UserRole,
          as: 'userRoles',
          include: [{ model: Role, as: 'role' }],
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
      username,
      email,
      phone,
      password,
      companyId,
      defaultLocationId,
      departmentId,
      first_name,
      firstName,
      last_name,
      lastName,
      designation,
      employee_code,
      employeeCode,
      roleCode,
      propertyIds,
    } = req.body

    const fName = firstName || first_name
    const lName = lastName || last_name
    const empCode = employeeCode || employee_code
    const uName = username ? username.trim() : null

    if (!fName || (!uName && !email && !phone)) {
      res.status(400).json({
        success: false,
        message: 'firstName and username, email, or phone are required.',
      })
      return
    }

    if (uName) {
      const existingUser = await User.findOne({ where: { username: uName } })
      if (existingUser) {
        res.status(400).json({
          success: false,
          message: 'Username is already taken. Please choose a different username.',
        })
        return
      }
    }

    const defaultPassword = password || 'Password@123'
    const hashedPassword = await bcrypt.hash(defaultPassword, 10)

    const user = await User.create({
      username: uName,
      email: email ? email.trim() : null,
      phone: phone ? phone.trim() : null,
      passwordHash: hashedPassword,
      companyId: companyId || null,
      defaultLocationId: defaultLocationId || null,
      status: 'ACTIVE',
      isActive: true,
    })

    await UserDetail.create({
      userId: user.id,
      firstName: fName.trim(),
      lastName: lName ? lName.trim() : null,
      designation: designation || null,
      employeeCode: empCode || null,
    })

    if (roleCode) {
      const targetRole = await Role.findOne({ where: { code: roleCode } })
      if (targetRole) {
        await UserRole.create({
          userId: user.id,
          roleId: targetRole.id,
          companyId: companyId || null,
          locationId: defaultLocationId || null,
          departmentId: departmentId || null,
        })
      }
    }

    // Insert user_locations mapping
    const locationIds = propertyIds || req.body.locIds || req.body.locationIds
    if (locationIds && Array.isArray(locationIds)) {
      for (const pId of locationIds) {
        await UserLocation.create({
          userId: user.id,
          locId: pId,
        })
      }
    }

    const createdUser = await User.findByPk(user.id, {
      include: [
        { model: UserDetail, as: 'profile' },
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

    // Regular users: Fetch properties mapped in user_locations
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
    const locationIds = req.body.propertyIds || req.body.locIds || req.body.locationIds

    await UserLocation.destroy({ where: { userId } })

    if (locationIds && Array.isArray(locationIds)) {
      for (const pId of locationIds) {
        await UserLocation.create({
          userId,
          locId: pId,
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
      userId,
      roleId: targetRole.id,
      companyId: companyId || null,
      locationId: locationId || null,
      departmentId: departmentId || null,
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
