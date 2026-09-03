import type { Request, Response } from 'express'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import bcrypt from 'bcryptjs'
import { Op } from 'sequelize'
import {
  Department,
  EmployeeManager,
  JobCategory,
  Property,
  Role,
  User,
  UserDetail,
  UserLocation,
} from '../../models/index.js'
import { AuthorizationService } from '../../services/authorization.service.js'
import sequelize from '../../config/db/index.js'
import { uploadFileToS3, uploadBase64ToS3 } from '../../middlewares/s3/index.js'

function sanitizeUuid(id: string | null | undefined): string | null {
  if (!id || typeof id !== 'string') return null
  const trimmed = id.trim()
  if (!trimmed || trimmed === '00000000-0000-0000-0000-000000000000') return null
  return trimmed
}

interface RoleDeptJobCatValidationResult {
  valid: boolean
  error?: string
  cleanDeptId: string | null
  cleanJobCatId: string | null
}

async function validateAndSanitizeRoleDeptJobCat(
  roleCode: string | null | undefined,
  deptIdInput: string | null | undefined,
  jobCatIdInput: string | null | undefined,
): Promise<RoleDeptJobCatValidationResult> {
  const roleUpper = (roleCode || '').toUpperCase()
  let cleanDeptId = sanitizeUuid(deptIdInput)
  let cleanJobCatId = sanitizeUuid(jobCatIdInput)

  if (['SUPER_ADMIN', 'ADMIN'].includes(roleUpper)) {
    return {
      valid: true,
      cleanDeptId: null,
      cleanJobCatId: null,
    }
  }

  if (['DOCTOR', 'NURSE', 'CARETAKER'].includes(roleUpper)) {
    const medDept = await Department.findOne({ where: { code: 'MED' } })
    if (!medDept) {
      return {
        valid: false,
        error: 'Medical department (MED) does not exist in the system.',
        cleanDeptId: null,
        cleanJobCatId: null,
      }
    }

    if (cleanDeptId && cleanDeptId !== medDept.id) {
      return {
        valid: false,
        error: 'For Doctor, Nurse, and Caretaker, operational department must be Medical.',
        cleanDeptId: null,
        cleanJobCatId: null,
      }
    }
    cleanDeptId = medDept.id

    const medJobCats = await JobCategory.findAll({ where: { departmentId: medDept.id } })
    const inhouseCat = medJobCats.find(
      (jc) => (jc.code || '').toUpperCase() === 'MED_INHOUSE' || jc.name.toLowerCase().includes('inhouse'),
    )
    const visitingCat = medJobCats.find(
      (jc) => (jc.code || '').toUpperCase() === 'MED_VISITING' || jc.name.toLowerCase().includes('visiting'),
    )

    if (roleUpper === 'DOCTOR') {
      if (cleanJobCatId) {
        const isValidDocCat = [inhouseCat?.id, visitingCat?.id].filter(Boolean).includes(cleanJobCatId)
        if (!isValidDocCat) {
          return {
            valid: false,
            error: 'For Doctor, job category must be either Inhouse or Visiting.',
            cleanDeptId: null,
            cleanJobCatId: null,
          }
        }
      } else if (inhouseCat) {
        cleanJobCatId = inhouseCat.id
      }
    } else {
      // NURSE or CARETAKER
      if (inhouseCat) {
        if (cleanJobCatId && cleanJobCatId !== inhouseCat.id) {
          return {
            valid: false,
            error: 'For Nurse and Caretaker, job category must be Inhouse.',
            cleanDeptId: null,
            cleanJobCatId: null,
          }
        }
        cleanJobCatId = inhouseCat.id
      }
    }
  } else {
    // Non-medical roles (MANAGER, EMPLOYEE, VENDOR, etc.): Cannot be assigned to Medical department
    if (cleanDeptId) {
      const medDept = await Department.findOne({ where: { code: 'MED' } })
      if (medDept && cleanDeptId === medDept.id) {
        return {
          valid: false,
          error: 'The Medical department is reserved exclusively for Doctor, Nurse, and Caretaker roles.',
          cleanDeptId: null,
          cleanJobCatId: null,
        }
      }
    }
  }

  return {
    valid: true,
    cleanDeptId,
    cleanJobCatId,
  }
}

function formatUserResponse(user: unknown): Record<string, unknown> | null {
  if (!user) return null
  const uObj = user as Record<string, unknown>
  const plain = (
    typeof uObj.toJSON === 'function' ? (user as { toJSON: () => Record<string, unknown> }).toJSON() : { ...uObj }
  ) as Record<string, unknown>
  const uLocs = (plain.userLocations || []) as Array<Record<string, unknown>>
  const empMgrs = (plain.employeeManagers || []) as Array<Record<string, unknown>>

  const enrichedULocs = uLocs.map((ul) => {
    const locId =
      ul.locId ||
      ul.loc_id ||
      ul.locationId ||
      ul.location_id ||
      (ul.property as Record<string, unknown> | undefined)?.id
    const empMgr = empMgrs.find((em) => em.locId === locId)
    const mgr = empMgr?.manager || ul.manager || null
    const mgrId = empMgr?.managerId || ul.managerId || null
    return {
      ...ul,
      managerId: mgrId,
      manager: mgr,
    }
  })

  return {
    ...plain,
    userLocations: enrichedULocs,
    userRoles: enrichedULocs,
  }
}

const userLocationInclude = [
  { model: Role, as: 'role' },
  { model: Property, as: 'property' },
  { model: Department, as: 'department' },
  { model: JobCategory, as: 'jobCategory' },
]

const employeeManagerInclude = {
  model: EmployeeManager,
  as: 'employeeManagers',
  include: [
    {
      model: User,
      as: 'manager',
      include: [
        { model: UserDetail, as: 'profile' },
        {
          model: UserLocation,
          as: 'userLocations',
          include: [
            { model: Department, as: 'department' },
            { model: JobCategory, as: 'jobCategory' },
          ],
        },
      ],
    },
    { model: Property, as: 'property' },
  ],
}

export async function getAllUsers(req: Request, res: Response): Promise<void> {
  try {
    const isGlobalQuery =
      req.query.allLocations === 'true' || req.query.global === 'true' || req.headers['x-global'] === 'true'

    const rawLocId = isGlobalQuery
      ? null
      : (req.headers['x-location-id'] as string) ||
        (req.headers['x-property-id'] as string) ||
        (req.query.locationId as string) ||
        (req.query.locId as string) ||
        (req.query.propertyId as string)

    const targetLocId = rawLocId && rawLocId.trim() !== '' ? rawLocId.trim() : null

    let userWhere: Record<string, unknown> = { isDeleted: false }

    if (targetLocId) {
      const locUserRecords = await UserLocation.findAll({
        where: { locId: targetLocId },
        attributes: ['userId'],
      })
      const userIdsInLoc = locUserRecords.map((u) => u.userId)

      userWhere = {
        isDeleted: false,
        [Op.or]: [{ id: { [Op.in]: userIdsInLoc } }, { defaultLocationId: targetLocId }],
      }
    }

    const users = (await User.findAll({
      where: userWhere,
      include: [
        { model: UserDetail, as: 'profile' },
        {
          model: UserLocation,
          as: 'userLocations',
          include: userLocationInclude,
        },
        employeeManagerInclude,
        {
          model: Property,
          as: 'assignedProperties',
          through: { attributes: [] },
        },
      ],
      order: [['createdAt', 'DESC']],
    })) as Array<User & { userLocations?: Array<UserLocation & { role?: Role }> }>

    const superAdminRole = await Role.findOne({ where: { code: 'SUPER_ADMIN' } })

    const nonSuperAdminUsers = users.filter((u) => {
      if (u.username === 'superadmin') return false
      const hasSuperAdminRole = u.userLocations?.some(
        (ul) => ul.roleId === superAdminRole?.id || ul.role?.code === 'SUPER_ADMIN',
      )
      if (hasSuperAdminRole) return false
      return true
    })

    res.status(200).json({
      success: true,
      data: nonSuperAdminUsers.map(formatUserResponse),
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
          model: UserLocation,
          as: 'userLocations',
          include: userLocationInclude,
        },
        employeeManagerInclude,
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
        ...formatUserResponse(user),
        authorizationContext: authCtx,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}

export async function createUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const {
      username,
      email,
      phone,
      password,
      companyId,
      defaultLocationId,
      departmentId,
      jobCategoryId,
      job_category_id,
      managerId,
      manager_id,
      first_name,
      firstName,
      last_name,
      lastName,
      employee_code,
      employeeCode,
      roleCode,
      propertyIds,
    } = req.body

    const fName = firstName || first_name
    const lName = lastName || last_name
    const empCode = employeeCode || employee_code
    const uName = username ? username.trim() : null
    const jCategoryId = jobCategoryId || job_category_id || null
    const mgrId = managerId || manager_id || null

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
          message: 'Username is already taken.',
        })
        return
      }
    }

    const passwordHash = password ? await bcrypt.hash(password, 10) : await bcrypt.hash('Password@123', 10)
    const operatingUserId = (req as AuthenticatedRequest).user?.id || null

    const user = await User.create({
      username: uName || undefined,
      email: email || undefined,
      phone: phone || undefined,
      passwordHash,
      status: 'ACTIVE',
      createdBy: operatingUserId,
      updatedBy: operatingUserId,
    })

    let photoUrl: string | null = req.body.photoUrl || req.body.photo_url || null
    const uploadedFile =
      req.file ||
      (req.files && typeof req.files === 'object' && ('photo' in req.files || 'avatar' in req.files)
        ? (req.files as Record<string, Express.Multer.File[]>).photo?.[0] ||
          (req.files as Record<string, Express.Multer.File[]>).avatar?.[0]
        : undefined)

    if (uploadedFile) {
      const s3Res = await uploadFileToS3(uploadedFile, 'users/avatars')
      photoUrl = s3Res.location
    } else if (photoUrl) {
      photoUrl = await uploadBase64ToS3(photoUrl, 'users/avatars')
    }

    let finalEmpCode = empCode && String(empCode).trim() ? String(empCode).trim() : null
    if (!finalEmpCode) {
      const todayStr = (new Date().toISOString().split('T')[0] as string).replace(/-/g, '')
      let count = await UserDetail.count()
      let candidate = `EMP-${todayStr}-${String(count + 1).padStart(4, '0')}`
      let exists = await UserDetail.findOne({ where: { employeeCode: candidate } })
      while (exists) {
        count++
        candidate = `EMP-${todayStr}-${String(count + 1).padStart(4, '0')}`
        exists = await UserDetail.findOne({ where: { employeeCode: candidate } })
      }
      finalEmpCode = candidate
    }

    await UserDetail.create({
      userId: user.id,
      firstName: fName,
      lastName: lName || null,
      employeeCode: finalEmpCode,
      dateOfJoining: req.body.dateOfJoining || req.body.date_of_joining || new Date().toISOString().split('T')[0],
      phone: phone || null,
      gender: req.body.gender || null,
      dateOfBirth: req.body.dateOfBirth || req.body.date_of_birth || null,
      emergencyContact: req.body.emergencyContact || req.body.emergency_contact || null,
      bloodGroup: req.body.bloodGroup || req.body.blood_group || null,
      qualification: req.body.qualification || null,
      experience: req.body.experience || null,
      address: req.body.address || null,
      photoUrl: photoUrl || null,
      createdBy: operatingUserId,
      updatedBy: operatingUserId,
    })

    // Validate and sanitize Role, Operational Department, and Job Category
    const roleDeptValidation = await validateAndSanitizeRoleDeptJobCat(roleCode, departmentId, jCategoryId)
    if (!roleDeptValidation.valid) {
      res.status(400).json({ success: false, message: roleDeptValidation.error })
      return
    }

    const cleanDeptId = roleDeptValidation.cleanDeptId
    const cleanJobCatId = roleDeptValidation.cleanJobCatId

    let targetRoleId: string | null = null
    if (roleCode) {
      const targetRole = await Role.findOne({ where: { code: roleCode } })
      if (targetRole) targetRoleId = targetRole.id
    }

    // Insert user_locations and employee_managers mapping
    const cleanCompId = sanitizeUuid(companyId)
    const cleanMgrId = sanitizeUuid(mgrId)

    const locationIds =
      propertyIds !== undefined ? propertyIds : req.body.locIds !== undefined ? req.body.locIds : req.body.locationIds
    let pIdsToCreate: string[] = []
    if (locationIds && Array.isArray(locationIds)) {
      pIdsToCreate = Array.from(
        new Set(locationIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim() !== '')),
      )
    } else if (defaultLocationId) {
      pIdsToCreate = [defaultLocationId]
    }

    if (pIdsToCreate.length === 0) {
      res.status(400).json({ success: false, message: 'At least one property location is required' })
      return
    }

    const isMultiPropertyRole = ['SUPER_ADMIN', 'ADMIN'].includes((roleCode || '').toUpperCase())
    if (!isMultiPropertyRole && pIdsToCreate.length > 1) {
      res.status(400).json({
        success: false,
        message: `Users with role '${roleCode || 'non-Admin'}' can only be assigned to a single property location.`,
      })
      return
    }

    const hasPropMgrMap =
      (req.body.propertyManagers && typeof req.body.propertyManagers === 'object') ||
      (req.body.property_managers && typeof req.body.property_managers === 'object')
    const propMgrMap = req.body.propertyManagers || req.body.property_managers || {}

    for (const pId of pIdsToCreate) {
      const rawPropMgr = propMgrMap[pId]
      let specificMgrId: string | null = null

      if (hasPropMgrMap) {
        if (
          rawPropMgr !== undefined &&
          rawPropMgr !== null &&
          typeof rawPropMgr === 'string' &&
          rawPropMgr.trim() !== ''
        ) {
          specificMgrId = sanitizeUuid(rawPropMgr)
        } else {
          specificMgrId = null
        }
      } else {
        specificMgrId = cleanMgrId
      }

      await UserLocation.create({
        userId: user.id,
        locId: pId,
        roleId: targetRoleId,
        companyId: cleanCompId,
        departmentId: cleanDeptId,
        jobCategoryId: cleanJobCatId,
        createdBy: operatingUserId,
        updatedBy: operatingUserId,
      })

      if (specificMgrId) {
        await EmployeeManager.create({
          userId: user.id,
          managerId: specificMgrId,
          locId: pId,
          createdBy: operatingUserId,
          updatedBy: operatingUserId,
        })
      }
    }

    const createdUser = await User.findByPk(user.id, {
      include: [
        { model: UserDetail, as: 'profile' },
        {
          model: UserLocation,
          as: 'userLocations',
          include: userLocationInclude,
        },
        employeeManagerInclude,
        { model: Property, as: 'assignedProperties', through: { attributes: [] } },
      ],
    })

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: formatUserResponse(createdUser),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}

export async function getUserAccessibleProperties(req: Request, res: Response): Promise<void> {
  try {
    const userPayload = (req as AuthenticatedRequest).user
    const userId = userPayload?.id || ''

    let isSuperAdmin = userPayload?.roles?.includes('SUPER_ADMIN') || false
    if (!isSuperAdmin && userId) {
      const dbUser = (await User.findByPk(userId, {
        include: [{ model: UserLocation, as: 'userLocations', include: [{ model: Role, as: 'role' }] }],
      })) as (User & { userLocations?: Array<UserLocation & { role?: Role }> }) | null

      if (dbUser?.username === 'superadmin') {
        isSuperAdmin = true
      } else {
        const uLocs = dbUser?.userLocations || []
        isSuperAdmin = uLocs.some((ul) => ul.role?.code === 'SUPER_ADMIN')
      }
    }

    if (isSuperAdmin) {
      // Super Admin automatically gets access to ALL properties
      const allProperties = await Property.findAll({
        where: { isDeleted: false },
        order: [['property_name', 'ASC']],
      })

      // Ensure user_locations has entries for all properties for this superadmin
      if (userId) {
        try {
          const superAdminRole = await Role.findOne({ where: { code: 'SUPER_ADMIN' } })
          for (const prop of allProperties) {
            const exists = await UserLocation.findOne({ where: { userId, locId: prop.id, isDeleted: false } })
            if (!exists) {
              await UserLocation.create({
                userId,
                locId: prop.id,
                roleId: superAdminRole?.id || null,
                companyId: prop.companyId || null,
                createdBy: userId,
                updatedBy: userId,
              })
            }
          }
        } catch (dbErr) {
          console.warn('Note: Could not sync all superadmin locations:', dbErr)
        }
      }

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
      where: { isDeleted: false },
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

export async function updateUserProperties(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.params.id as string
    const { propertyIds, defaultLocationId, locIds } = req.body
    const operatingUserId = (req as AuthenticatedRequest).user?.id || null

    const rawPIds = propertyIds !== undefined ? propertyIds : locIds !== undefined ? locIds : undefined
    let pIdsArray: string[] = []
    if (Array.isArray(rawPIds)) {
      pIdsArray = rawPIds.filter((id) => typeof id === 'string' && id.trim() !== '')
    } else if (defaultLocationId) {
      pIdsArray = [defaultLocationId]
    }

    const pIds = Array.from(new Set(pIdsArray))

    if (pIds.length === 0) {
      res.status(400).json({ success: false, message: 'At least one property location is required' })
      return
    }

    const existingLocs = await UserLocation.findAll({
      where: { userId },
      include: [{ model: Role, as: 'role' }],
    })
    const primaryLoc = existingLocs[0]
    const roleCodeToUse = (primaryLoc as (UserLocation & { role?: Role }) | undefined)?.role?.code || ''
    const isMultiPropRole = ['SUPER_ADMIN', 'ADMIN'].includes((roleCodeToUse || '').toUpperCase())
    if (!isMultiPropRole && pIds.length > 1) {
      res.status(400).json({
        success: false,
        message: `Users with role '${roleCodeToUse || 'non-Admin'}' can only be assigned to a single property location.`,
      })
      return
    }

    const roleIdToUse = primaryLoc?.roleId || null
    const companyIdToUse = primaryLoc?.companyId || null
    const deptIdToUse = primaryLoc?.departmentId || null
    const jobCatIdToUse = primaryLoc?.jobCategoryId || null

    await UserLocation.destroy({ where: { userId }, force: true })

    for (const pId of pIds) {
      await UserLocation.create({
        userId,
        locId: pId,
        roleId: roleIdToUse,
        companyId: companyIdToUse,
        departmentId: deptIdToUse,
        jobCategoryId: jobCatIdToUse,
        createdBy: operatingUserId,
        updatedBy: operatingUserId,
      })
    }

    const updatedUser = await User.findByPk(userId, {
      include: [
        { model: UserDetail, as: 'profile' },
        {
          model: UserLocation,
          as: 'userLocations',
          include: userLocationInclude,
        },
        employeeManagerInclude,
        { model: Property, as: 'assignedProperties', through: { attributes: [] } },
      ],
    })

    res.status(200).json({
      success: true,
      message: 'User property locations updated successfully',
      data: formatUserResponse(updatedUser),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}

export async function assignUserRole(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.params.id as string
    const { roleId, roleCode, companyId, locationId, locId, departmentId, jobCategoryId, job_category_id } = req.body
    const operatingUserId = (req as AuthenticatedRequest).user?.id || null

    let targetRole = null
    if (roleId) targetRole = await Role.findByPk(roleId)
    else if (roleCode) targetRole = await Role.findOne({ where: { code: roleCode } })

    if (!targetRole) {
      res.status(400).json({ success: false, message: 'Valid roleId or roleCode is required' })
      return
    }

    const jCategoryId = jobCategoryId || job_category_id || undefined

    const roleDeptValidation = await validateAndSanitizeRoleDeptJobCat(targetRole.code, departmentId, jCategoryId)
    if (!roleDeptValidation.valid) {
      res.status(400).json({ success: false, message: roleDeptValidation.error })
      return
    }

    const cleanDeptId = roleDeptValidation.cleanDeptId
    const cleanJobCatId = roleDeptValidation.cleanJobCatId

    const userLocs = await UserLocation.findAll({ where: { userId } })
    if (userLocs.length > 0) {
      await UserLocation.update(
        {
          roleId: targetRole.id,
          companyId: companyId || undefined,
          departmentId: cleanDeptId,
          jobCategoryId: cleanJobCatId,
          updatedBy: operatingUserId,
        },
        { where: { userId } },
      )
    } else {
      const pId = locationId || locId
      if (!pId) {
        res.status(400).json({
          success: false,
          message: 'locationId is required when user has no existing locations',
        })
        return
      }
      await UserLocation.create({
        userId,
        locId: pId,
        roleId: targetRole.id,
        companyId: companyId || undefined,
        departmentId: cleanDeptId,
        jobCategoryId: cleanJobCatId,
        createdBy: operatingUserId,
        updatedBy: operatingUserId,
      })
    }

    res.status(200).json({
      success: true,
      message: 'Role assigned to user successfully',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const user = await User.findByPk(id)
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }

    const operatingUserId = (req as AuthenticatedRequest).user?.id || null
    const {
      username,
      email,
      phone,
      password,
      companyId,
      defaultLocationId,
      departmentId,
      roleCode,
      roleId,
      jobCategoryId,
      job_category_id,
      managerId,
      manager_id,
      firstName,
      first_name,
      lastName,
      last_name,
      employeeCode,
      employee_code,
      propertyIds,
      property_ids,
      properties,
      locIds,
      loc_ids,
      locationIds,
      location_ids,
      locations,
    } = req.body

    const fName = firstName || first_name
    const lName = lastName || last_name
    const empCode = employeeCode || employee_code
    const uName = username ? username.trim() : null
    const jCategoryId = jobCategoryId || job_category_id || undefined
    const mgrId = managerId || manager_id || undefined
    void mgrId

    if (uName && uName !== user.username) {
      const existingUser = await User.findOne({ where: { username: uName } })
      if (existingUser && existingUser.id !== user.id) {
        res.status(400).json({ success: false, message: 'Username is already taken' })
        return
      }
    }

    // Update User main record
    const userUpdatePayload: Record<string, unknown> = { updatedBy: operatingUserId }
    if (uName !== undefined && uName !== null) userUpdatePayload.username = uName
    if (email !== undefined) userUpdatePayload.email = email || null
    if (phone !== undefined) userUpdatePayload.phone = phone || null
    if (password) userUpdatePayload.passwordHash = await bcrypt.hash(password, 10)
    if (defaultLocationId !== undefined) userUpdatePayload.defaultLocationId = sanitizeUuid(defaultLocationId)

    await user.update(userUpdatePayload)

    // Update UserDetail record
    const detailUpdatePayload: Record<string, unknown> = { updatedBy: operatingUserId }
    if (fName !== undefined) detailUpdatePayload.firstName = fName
    if (lName !== undefined) detailUpdatePayload.lastName = lName || null
    if (empCode !== undefined) detailUpdatePayload.employeeCode = empCode || null
    if (req.body.dateOfJoining !== undefined || req.body.date_of_joining !== undefined) {
      detailUpdatePayload.dateOfJoining = req.body.dateOfJoining || req.body.date_of_joining || null
    }
    if (phone !== undefined) detailUpdatePayload.phone = phone || null
    if (req.body.gender !== undefined) detailUpdatePayload.gender = req.body.gender || null
    if (req.body.dateOfBirth !== undefined || req.body.date_of_birth !== undefined) {
      detailUpdatePayload.dateOfBirth = req.body.dateOfBirth || req.body.date_of_birth || null
    }
    if (req.body.emergencyContact !== undefined || req.body.emergency_contact !== undefined) {
      detailUpdatePayload.emergencyContact = req.body.emergencyContact || req.body.emergency_contact || null
    }
    if (req.body.bloodGroup !== undefined || req.body.blood_group !== undefined) {
      detailUpdatePayload.bloodGroup = req.body.bloodGroup || req.body.blood_group || null
    }
    if (req.body.qualification !== undefined) detailUpdatePayload.qualification = req.body.qualification || null
    if (req.body.experience !== undefined) detailUpdatePayload.experience = req.body.experience || null
    const uploadedFile =
      req.file ||
      (req.files && typeof req.files === 'object' && ('photo' in req.files || 'avatar' in req.files)
        ? (req.files as Record<string, Express.Multer.File[]>).photo?.[0] ||
          (req.files as Record<string, Express.Multer.File[]>).avatar?.[0]
        : undefined)

    if (uploadedFile) {
      const s3Res = await uploadFileToS3(uploadedFile, 'users/avatars')
      detailUpdatePayload.photoUrl = s3Res.location
    } else if (req.body.photoUrl !== undefined || req.body.photo_url !== undefined) {
      const rawPhoto = req.body.photoUrl || req.body.photo_url || null
      detailUpdatePayload.photoUrl = await uploadBase64ToS3(rawPhoto, 'users/avatars')
    }

    const existingDetail = await UserDetail.findOne({ where: { userId: user.id } })
    if (existingDetail) {
      await existingDetail.update(detailUpdatePayload)
    } else {
      await UserDetail.create({
        userId: user.id,
        firstName: fName || 'DefaultFirst',
        lastName: lName || null,
        employeeCode: empCode || null,
        dateOfJoining: req.body.dateOfJoining || req.body.date_of_joining || new Date().toISOString().split('T')[0],
        phone: phone || null,
        gender: req.body.gender || null,
        dateOfBirth: req.body.dateOfBirth || req.body.date_of_birth || null,
        emergencyContact: req.body.emergencyContact || req.body.emergency_contact || null,
        bloodGroup: req.body.bloodGroup || req.body.blood_group || null,
        qualification: req.body.qualification || null,
        experience: req.body.experience || null,
        address: req.body.address || null,
        photoUrl: (detailUpdatePayload.photoUrl as string) || null,
        createdBy: operatingUserId,
        updatedBy: operatingUserId,
      })
    }

    let targetRoleId: string | null = roleId ? sanitizeUuid(roleId) : null
    let targetRoleCode: string | null = roleCode || null
    if (targetRoleId && !targetRoleCode) {
      const roleObj = await Role.findByPk(targetRoleId)
      if (roleObj) targetRoleCode = roleObj.code
    } else if (!targetRoleId && targetRoleCode) {
      const targetRole = await Role.findOne({ where: { code: targetRoleCode } })
      if (targetRole) targetRoleId = targetRole.id
    }

    // Update UserLocations and EmployeeManagers if propertyIds passed
    const existingLocs = await UserLocation.findAll({
      where: { userId: user.id },
      include: [{ model: Role, as: 'role' }],
    })
    const primaryUserLoc = existingLocs[0] as (UserLocation & { role?: Role }) | undefined
    const effectiveRoleCode = targetRoleCode || primaryUserLoc?.role?.code

    const rawDeptInput = departmentId !== undefined ? departmentId : primaryUserLoc?.departmentId
    const rawJobCatInput =
      jobCategoryId !== undefined || job_category_id !== undefined
        ? jobCategoryId || job_category_id
        : primaryUserLoc?.jobCategoryId

    const roleDeptValidation = await validateAndSanitizeRoleDeptJobCat(effectiveRoleCode, rawDeptInput, rawJobCatInput)
    if (!roleDeptValidation.valid) {
      res.status(400).json({ success: false, message: roleDeptValidation.error })
      return
    }

    const cleanCompId = sanitizeUuid(companyId || user.companyId || primaryUserLoc?.companyId)
    const cleanDeptId = roleDeptValidation.cleanDeptId
    const cleanJobCatId = roleDeptValidation.cleanJobCatId
    const cleanMgrId =
      managerId !== undefined || manager_id !== undefined ? sanitizeUuid(managerId || manager_id) : null

    // Extract target single propertyId/locId strictly from req.body
    const targetSinglePropId = sanitizeUuid(
      req.body.propertyId ||
        req.body.property_id ||
        req.body.property ||
        req.body.locId ||
        req.body.loc_id ||
        req.body.locationId ||
        req.body.location_id,
    )

    const hasManagerIdInBody =
      Object.prototype.hasOwnProperty.call(req.body, 'managerId') ||
      Object.prototype.hasOwnProperty.call(req.body, 'manager_id')

    const propMgrMap: Record<string, string | null> = {}
    const rawPropMgrInput = req.body.propertyManagers || req.body.property_managers
    if (rawPropMgrInput && typeof rawPropMgrInput === 'object') {
      Object.entries(rawPropMgrInput).forEach(([pId, mId]) => {
        if (typeof pId === 'string' && pId.trim()) {
          const cleanKey = pId.trim()
          const cleanVal = typeof mId === 'string' && mId.trim() ? sanitizeUuid(mId) : null
          propMgrMap[cleanKey] = cleanVal
        }
      })
    }

    let effectivePropId = targetSinglePropId
    if (!effectivePropId && hasManagerIdInBody) {
      const headerLoc = (req.headers['x-location-id'] as string) || (req.headers['x-property-id'] as string)
      const primaryLocId = primaryUserLoc?.locId
      effectivePropId = sanitizeUuid(headerLoc || primaryLocId)
    }

    if (effectivePropId && hasManagerIdInBody) {
      const rawMgrVal = req.body.managerId ?? req.body.manager_id
      const cleanSpecificMgr = typeof rawMgrVal === 'string' && rawMgrVal.trim() ? sanitizeUuid(rawMgrVal) : null
      propMgrMap[effectivePropId] = cleanSpecificMgr
    }

    const hasPropMgrMap = Object.keys(propMgrMap).length > 0

    const rawPIds =
      propertyIds !== undefined
        ? propertyIds
        : property_ids !== undefined
          ? property_ids
          : properties !== undefined
            ? properties
            : locIds !== undefined
              ? locIds
              : loc_ids !== undefined
                ? loc_ids
                : locationIds !== undefined
                  ? locationIds
                  : location_ids !== undefined
                    ? location_ids
                    : locations !== undefined
                      ? locations
                      : undefined

    console.log('==================================================')
    console.log('[BE updateUser] User ID:', user.id)
    console.log('[BE updateUser] Request Body:', JSON.stringify(req.body))
    console.log('[BE updateUser] Target Single Property ID:', targetSinglePropId)
    console.log('[BE updateUser] Has ManagerId In Body:', hasManagerIdInBody)
    console.log('[BE updateUser] Constructed propMgrMap:', JSON.stringify(propMgrMap))
    console.log('==================================================')

    let pIdsArray: string[] | undefined = undefined
    if (rawPIds !== undefined) {
      if (Array.isArray(rawPIds)) {
        pIdsArray = rawPIds.filter((id) => typeof id === 'string' && id.trim() !== '')
      } else if (typeof rawPIds === 'string' && rawPIds.trim() !== '') {
        pIdsArray = [rawPIds.trim()]
      }
    }

    if (pIdsArray === undefined && existingLocs.length === 0) {
      const headerLocId =
        (req.headers['x-location-id'] as string) ||
        (req.headers['x-property-id'] as string) ||
        (req.query.locationId as string) ||
        (req.query.propertyId as string)
      if (headerLocId && headerLocId.trim() !== '') {
        pIdsArray = [headerLocId.trim()]
      }
    }

    const hasAnyFieldToUpdate =
      targetRoleId !== null ||
      departmentId !== undefined ||
      jCategoryId !== undefined ||
      hasPropMgrMap ||
      (hasManagerIdInBody && cleanMgrId !== null) ||
      companyId !== undefined

    if (pIdsArray !== undefined) {
      const pIds = Array.from(new Set(pIdsArray))
      console.log('[BE updateUser] Full property array overwrite mode. Deduplicated pIds to save:', pIds)
      if (pIds.length === 0) {
        res.status(400).json({ success: false, message: 'At least one property location is required' })
        return
      }

      const effectiveRoleCode =
        roleCode || (primaryUserLoc as (UserLocation & { role?: Role }) | undefined)?.role?.code || ''
      const isMultiPropRole = ['SUPER_ADMIN', 'ADMIN'].includes((effectiveRoleCode || '').toUpperCase())
      if (!isMultiPropRole && pIds.length > 1) {
        res.status(400).json({
          success: false,
          message: `Users with role '${effectiveRoleCode || 'non-Admin'}' can only be assigned to a single property location.`,
        })
        return
      }
      const transaction = await sequelize.transaction()
      try {
        await UserLocation.destroy({ where: { userId: user.id }, force: true, transaction })
        await EmployeeManager.destroy({ where: { userId: user.id }, force: true, transaction })

        for (const pId of pIds) {
          let specificMgrId: string | null = null

          if (pId in propMgrMap) {
            specificMgrId = propMgrMap[pId] ?? null
          } else if (hasPropMgrMap) {
            specificMgrId = null
          } else {
            specificMgrId = cleanMgrId
          }

          console.log(`[BE updateUser] Creating UserLocation for userId=${user.id}, locId=${pId}`)
          await UserLocation.create(
            {
              userId: user.id,
              locId: pId,
              roleId: targetRoleId || primaryUserLoc?.roleId || null,
              companyId: cleanCompId,
              departmentId: cleanDeptId,
              jobCategoryId: cleanJobCatId,
              createdBy: operatingUserId,
              updatedBy: operatingUserId,
            },
            { transaction },
          )

          if (specificMgrId) {
            console.log(
              `[BE updateUser] Inserting EmployeeManager: userId=${user.id}, locId=${pId}, managerId=${specificMgrId}`,
            )
            await EmployeeManager.create(
              {
                userId: user.id,
                managerId: specificMgrId,
                locId: pId,
                createdBy: operatingUserId,
                updatedBy: operatingUserId,
              },
              { transaction },
            )
          } else {
            console.log(`[BE updateUser] No manager assigned for locId=${pId}`)
          }
        }
        await transaction.commit()
        console.log('[BE updateUser] Transaction committed successfully!')
      } catch (tErr) {
        await transaction.rollback()
        console.error('[BE updateUser] Transaction failed & rolled back:', tErr)
        throw tErr
      }
    } else if (hasAnyFieldToUpdate) {
      console.log('[BE updateUser] Partial property / manager update mode.')
      const updatePayload: Record<string, unknown> = { updatedBy: operatingUserId }
      if (targetRoleId) updatePayload.roleId = targetRoleId
      if (companyId !== undefined) updatePayload.companyId = cleanCompId
      if (departmentId !== undefined) updatePayload.departmentId = cleanDeptId
      if (jCategoryId !== undefined) updatePayload.jobCategoryId = cleanJobCatId

      if (Object.keys(updatePayload).length > 1) {
        console.log('[BE updateUser] Updating UserLocation common fields:', updatePayload)
        await UserLocation.update(updatePayload, { where: { userId: user.id } })
      }

      if (hasPropMgrMap) {
        for (const [pId, mId] of Object.entries(propMgrMap)) {
          console.log(`[BE updateUser] Processing location manager mapping for pId=${pId}, mId=${mId}`)
          // Ensure UserLocation exists for this property
          const uLocExists = await UserLocation.findOne({ where: { userId: user.id, locId: pId } })
          if (!uLocExists) {
            console.log(`[BE updateUser] UserLocation for pId=${pId} did not exist. Creating default UserLocation.`)
            await UserLocation.create({
              userId: user.id,
              locId: pId,
              roleId: targetRoleId || primaryUserLoc?.roleId || null,
              companyId: cleanCompId || primaryUserLoc?.companyId || null,
              departmentId: cleanDeptId || primaryUserLoc?.departmentId || null,
              jobCategoryId: cleanJobCatId || primaryUserLoc?.jobCategoryId || null,
              createdBy: operatingUserId,
              updatedBy: operatingUserId,
            })
          }

          // Update employee_managers table for pId
          console.log(`[BE updateUser] Destroying existing EmployeeManager entries for userId=${user.id}, locId=${pId}`)
          const deletedCount = await EmployeeManager.destroy({ where: { userId: user.id, locId: pId }, force: true })
          console.log(`[BE updateUser] Successfully destroyed ${deletedCount} EmployeeManager record(s).`)

          if (mId) {
            console.log(
              `[BE updateUser] Inserting new EmployeeManager entry: userId=${user.id}, locId=${pId}, managerId=${mId}`,
            )
            const createdEmpMgr = await EmployeeManager.create({
              userId: user.id,
              managerId: mId,
              locId: pId,
              createdBy: operatingUserId,
              updatedBy: operatingUserId,
            })
            console.log(`[BE updateUser] Inserted EmployeeManager record ID: ${createdEmpMgr.id}`)
          } else {
            console.log(
              `[BE updateUser] Manager unassigned for locId=${pId}. Old manager record removed, no new entry created.`,
            )
          }
        }
      } else if (cleanMgrId) {
        const currentLocs = await UserLocation.findAll({ where: { userId: user.id } })
        for (const loc of currentLocs) {
          console.log(`[BE updateUser] Fallback manager update for locId=${loc.locId}`)
          await EmployeeManager.destroy({ where: { userId: user.id, locId: loc.locId }, force: true })
          await EmployeeManager.create({
            userId: user.id,
            managerId: cleanMgrId,
            locId: loc.locId,
            createdBy: operatingUserId,
            updatedBy: operatingUserId,
          })
        }
      }
    } else {
      console.log('[BE updateUser] No location/manager update fields provided in req.body. Skipping location updates.')
    }
    console.log('==================================================')
    console.log('--------------------------------------------------')

    const updatedUser = await User.findByPk(user.id, {
      include: [
        { model: UserDetail, as: 'profile' },
        {
          model: UserLocation,
          as: 'userLocations',
          include: userLocationInclude,
        },
        employeeManagerInclude,
        { model: Property, as: 'assignedProperties', through: { attributes: [] } },
      ],
    })

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: formatUserResponse(updatedUser),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}

export async function getSelfProfile(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user?.id
    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required' })
      return
    }

    const user = await User.findByPk(userId, {
      include: [
        { model: UserDetail, as: 'profile' },
        {
          model: UserLocation,
          as: 'userLocations',
          include: userLocationInclude,
        },
        employeeManagerInclude,
        {
          model: Property,
          as: 'assignedProperties',
          through: { attributes: [] },
        },
      ],
    })

    if (!user) {
      res.status(404).json({ success: false, message: 'User profile not found' })
      return
    }

    res.status(200).json({
      success: true,
      data: formatUserResponse(user),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}

export async function updateSelfProfile(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as AuthenticatedRequest).user?.id
    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required' })
      return
    }

    const user = await User.findByPk(userId)
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' })
      return
    }

    const { firstName, first_name, lastName, last_name, phone, email, password } = req.body

    const fName = firstName || first_name
    const lName = lastName || last_name

    // Update User core record
    const userPayload: Record<string, unknown> = { updatedBy: userId }
    if (email !== undefined && email) userPayload.email = email
    if (phone !== undefined) userPayload.phone = phone || null
    if (password) userPayload.passwordHash = await bcrypt.hash(password, 10)

    await user.update(userPayload)

    // Handle photo upload if file or base64 provided
    const detailPayload: Record<string, unknown> = { updatedBy: userId }
    if (fName !== undefined) detailPayload.firstName = fName
    if (lName !== undefined) detailPayload.lastName = lName || null
    if (phone !== undefined) detailPayload.phone = phone || null

    const uploadedFile =
      req.file ||
      (req.files && typeof req.files === 'object' && ('photo' in req.files || 'avatar' in req.files)
        ? (req.files as Record<string, Express.Multer.File[]>).photo?.[0] ||
          (req.files as Record<string, Express.Multer.File[]>).avatar?.[0]
        : undefined)

    if (uploadedFile) {
      const s3Res = await uploadFileToS3(uploadedFile, 'users/avatars')
      detailPayload.photoUrl = s3Res.location
    } else if (req.body.photoUrl !== undefined || req.body.photo_url !== undefined) {
      const rawPhoto = req.body.photoUrl || req.body.photo_url || null
      detailPayload.photoUrl = await uploadBase64ToS3(rawPhoto, 'users/avatars')
    }

    const existingDetail = await UserDetail.findOne({ where: { userId: user.id } })
    if (existingDetail) {
      await existingDetail.update(detailPayload)
    } else {
      await UserDetail.create({
        userId: user.id,
        firstName: fName || 'Admin',
        lastName: lName || null,
        phone: phone || null,
        photoUrl: (detailPayload.photoUrl as string) || null,
        createdBy: userId,
        updatedBy: userId,
      })
    }

    const updatedUser = await User.findByPk(user.id, {
      include: [
        { model: UserDetail, as: 'profile' },
        {
          model: UserLocation,
          as: 'userLocations',
          include: userLocationInclude,
        },
        employeeManagerInclude,
        { model: Property, as: 'assignedProperties', through: { attributes: [] } },
      ],
    })

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: formatUserResponse(updatedUser),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ success: false, message })
  }
}
