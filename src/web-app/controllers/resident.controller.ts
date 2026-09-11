import type { Request, Response } from 'express'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import bcrypt from 'bcryptjs'
import { Op, type WhereOptions } from 'sequelize'
import {
  Property,
  PropertyFloor,
  PropertyUnit,
  Resident,
  ResidentFamilyMember,
  Package,
  PackageSubscription,
  PackageSubscriptionFeature,
  CarePackageFeaturesMap,
  CareTaskAssignment,
  AdditionalTaskCharge,
  CareTask,
  User,
  UserDetail,
} from '../../models/index.js'
import { OwnershipType, ResidentStatus, ResidentType } from '../../enums/resident.enum.js'
import { SubscriptionStatus } from '../../enums/packageSubscription.enum.js'
import { OccupancyStatus } from '../../enums/propertyUnit.enum.js'
import { uploadFileToS3, uploadBase64ToS3 } from '../../middlewares/s3/index.js'
import { syncPackageTasksForResidents } from './careTaskAssignment.controller.js'
import { verifyToken } from '../../utils/jwt.js'

export async function createResident(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const {
      unitId,
      locId,
      companyId,
      residentType,
      ownershipType,
      isResiding,
      firstName,
      lastName,
      gender,
      dob,
      username,
      password,
      email,
      phone,
      emergencyContact,
      bloodGroup,
      photoUrl,
      moveInDate,
      rentAmount,
      payRentToCompany,
      carePackageId,
      taskSchedules,
      familyMembers,
    } = req.body

    if (!unitId || !locId || !firstName || !residentType || !email || !phone) {
      res.status(400).json({
        success: false,
        message: 'unitId, locId, firstName, residentType, email, and phone are required.',
      })
      return
    }

    // Validate Care Package if provided
    let selectedCarePackage: Package | null = null
    if (carePackageId) {
      selectedCarePackage = await Package.findOne({
        where: { id: carePackageId, isDeleted: false, isActive: true },
      })
      if (!selectedCarePackage) {
        res.status(404).json({
          success: false,
          message: 'Selected Care Package not found or inactive.',
        })
        return
      }
    }

    const phoneRegex = /^[6-9]\d{9}$/
    const cleanPhone = String(phone).replace(/[\s-]/g, '')
    if (!phoneRegex.test(cleanPhone)) {
      res.status(400).json({
        success: false,
        message: 'Mobile phone must be a 10-digit number starting with 6, 7, 8, or 9.',
      })
      return
    }

    if (emergencyContact) {
      const cleanEmergency = String(emergencyContact).replace(/[\s-]/g, '')
      if (!phoneRegex.test(cleanEmergency)) {
        res.status(400).json({
          success: false,
          message: 'Emergency contact phone must be a 10-digit number starting with 6, 7, 8, or 9.',
        })
        return
      }
    }

    const unit = await PropertyUnit.findByPk(unitId)
    if (!unit) {
      res.status(404).json({ success: false, message: 'Property Unit not found.' })
      return
    }

    const type = residentType as ResidentType
    const residingFlag = isResiding !== undefined ? Boolean(isResiding) : true

    // 1. Mandatory Off-site Owner Validation for Tenant Onboarding
    if (type === ResidentType.TENANT) {
      const existingOwner = await Resident.findOne({
        where: {
          unitId,
          residentType: ResidentType.OWNER,
          isDeleted: false,
        },
      })

      if (!existingOwner) {
        res.status(400).json({
          success: false,
          message: `Cannot onboard tenant: Flat/Unit "${unit.unit_number}" has no registered Owner. Please register the Owner first.`,
        })
        return
      }

      if (existingOwner.isResiding) {
        res.status(400).json({
          success: false,
          message: `Cannot onboard tenant: Owner of Flat/Unit "${unit.unit_number}" is currently marked as Physically Residing. Owner must be an Off-site Landlord to rent out the unit.`,
        })
        return
      }
    }

    // 2. Check username uniqueness if provided for primary mobile login
    let hashedPassword: string | null = null
    if (username) {
      const trimmedUsername = username.trim()
      const existingUser = await Resident.findOne({
        where: { username: trimmedUsername, isDeleted: false },
      })
      const existingFm = await ResidentFamilyMember.findOne({
        where: { username: trimmedUsername, isDeleted: false },
      })
      if (existingUser || existingFm) {
        res.status(400).json({
          success: false,
          message: 'Username is already taken by another resident or family member.',
        })
        return
      }
      const defaultPassword = password || 'Resident@123'
      hashedPassword = await bcrypt.hash(defaultPassword, 10)
    }

    // 3. Single Residing Constraint: If new resident is residing, flip previous residing status for flat
    if (residingFlag && (type === ResidentType.OWNER || type === ResidentType.TENANT)) {
      await Resident.update(
        { isResiding: false },
        {
          where: {
            unitId,
            isDeleted: false,
          },
        },
      )
    }

    const userPayload = (req as Request & { user?: { id?: string; username?: string } }).user
    const operatorId = userPayload?.id || userPayload?.username || 'system'

    let finalPhotoUrl: string | null = photoUrl || null
    const uploadedFile =
      req.file ||
      (req.files && typeof req.files === 'object' && ('photo' in req.files || 'avatar' in req.files)
        ? (req.files as Record<string, Express.Multer.File[]>).photo?.[0] ||
          (req.files as Record<string, Express.Multer.File[]>).avatar?.[0]
        : undefined)

    if (uploadedFile) {
      const s3Res = await uploadFileToS3(uploadedFile, 'residents/avatars')
      finalPhotoUrl = s3Res.location
    } else if (finalPhotoUrl) {
      finalPhotoUrl = await uploadBase64ToS3(finalPhotoUrl, 'residents/avatars')
    }

    // 4. Create Resident Record
    const resident = await Resident.create({
      unitId,
      locId,
      companyId: companyId || null,
      carePackageId: selectedCarePackage ? selectedCarePackage.id : null,
      residentType: type,
      ownershipType: (ownershipType as OwnershipType) || OwnershipType.PRIMARY,
      isResiding: residingFlag,
      firstName: firstName.trim(),
      lastName: lastName ? lastName.trim() : null,
      gender: gender || null,
      dob: dob || null,
      username: username ? username.trim() : null,
      passwordHash: hashedPassword,
      email: email ? email.trim() : null,
      phone: phone ? phone.trim() : null,
      emergencyContact: emergencyContact || null,
      bloodGroup: bloodGroup || null,
      photoUrl: finalPhotoUrl,
      moveInDate: moveInDate || null,
      rentAmount: rentAmount !== undefined && rentAmount !== null && rentAmount !== '' ? Number(rentAmount) : null,
      payRentToCompany: payRentToCompany !== undefined ? Boolean(payRentToCompany) : false,
      status: ResidentStatus.ACTIVE,
      isActive: true,
      createdBy: operatorId,
      updatedBy: operatorId,
    })

    // 5. Create Family Members if provided
    if (Array.isArray(familyMembers) && familyMembers.length > 0) {
      const familyMemberRecords = await Promise.all(
        familyMembers.map(async (fm) => {
          let fmPasswordHash: string | null = null
          if (fm.username) {
            const rawPass = fm.password || 'Resident@123'
            fmPasswordHash = await bcrypt.hash(rawPass, 10)
          }

          const fmResiding = residingFlag
          const fmPhotoUrl = await uploadBase64ToS3(fm.photoUrl, 'residents/avatars')

          return {
            residentId: resident.id,
            firstName: fm.firstName.trim(),
            lastName: fm.lastName ? fm.lastName.trim() : null,
            relation: fm.relation ? fm.relation.trim() : 'Family',
            isResiding: fmResiding,
            gender: fm.gender || null,
            dob: fm.dob || null,
            bloodGroup: fm.bloodGroup || null,
            photoUrl: fmPhotoUrl,
            phone: fm.phone ? fm.phone.trim() : null,
            username: fm.username ? fm.username.trim() : null,
            passwordHash: fmPasswordHash,
            email: fm.email ? fm.email.trim() : null,
            createdBy: operatorId,
            updatedBy: operatorId,
            isDeleted: false,
          }
        }),
      )
      await ResidentFamilyMember.bulkCreate(familyMemberRecords)
    }

    // 6. Create Package Subscription and Seed Features if carePackageId was provided
    if (selectedCarePackage) {
      const startDate = moveInDate ? new Date(moveInDate) : new Date()
      const subscription = await PackageSubscription.create({
        residentId: resident.id,
        carePackageId: selectedCarePackage.id,
        propertyId: locId,
        startDate,
        endDate: null,
        totalCost: selectedCarePackage.packageCost,
        status: SubscriptionStatus.ACTIVE,
        isPrevious: false,
        notes: `Assigned during onboarding: ${selectedCarePackage.packageName}`,
        createdBy: operatorId,
        updatedBy: operatorId,
      })

      const featureMappings = await CarePackageFeaturesMap.findAll({
        where: { carePackageId: selectedCarePackage.id, isDeleted: false },
      })

      if (featureMappings.length > 0) {
        const subFeatures = featureMappings.map((fm) => ({
          packageSubscriptionId: subscription.id,
          featureId: fm.featureId,
          complimentaryCount: Number(fm.complimentaryCount || 0),
          remainingCount: Number(fm.complimentaryCount || 0),
          createdBy: operatorId,
          updatedBy: operatorId,
        }))
        await PackageSubscriptionFeature.bulkCreate(subFeatures)
        await syncPackageTasksForResidents(resident.id, resident.locId, taskSchedules)
      }
    }

    // 7. Update PropertyUnit Occupancy Status
    if (residingFlag) {
      if (type === ResidentType.OWNER) {
        await unit.update({ occupancyStatus: OccupancyStatus.OWNER_OCCUPIED })
      } else if (type === ResidentType.TENANT) {
        await unit.update({ occupancyStatus: OccupancyStatus.TENANT_OCCUPIED })
      }
    }

    const createdRecord = await Resident.findByPk(resident.id, {
      include: [
        { model: PropertyUnit, as: 'unit' },
        { model: ResidentFamilyMember, as: 'familyMembers', where: { isDeleted: false }, required: false },
        { model: Package, as: 'carePackage', required: false },
        {
          model: PackageSubscription,
          as: 'packageSubscriptions',
          required: false,
          where: { isDeleted: false },
          include: [{ model: PackageSubscriptionFeature, as: 'packageSubscriptionFeatures', required: false }],
        },
      ],
    })

    res.status(201).json({
      success: true,
      message: 'Resident onboarded successfully',
      data: createdRecord,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error onboarding resident'
    res.status(500).json({ success: false, message })
  }
}

export async function getResidentsByUnit(req: Request, res: Response): Promise<void> {
  try {
    const { unitId } = req.params

    const residents = await Resident.findAll({
      where: { unitId, isDeleted: false },
      include: [
        { model: PropertyUnit, as: 'unit' },
        { model: ResidentFamilyMember, as: 'familyMembers', where: { isDeleted: false }, required: false },
      ],
      order: [['createdAt', 'DESC']],
    })

    const residingOccupant = residents.find((r) => r.isResiding)
    const owner = residents.find((r) => r.residentType === ResidentType.OWNER)

    res.status(200).json({
      success: true,
      data: {
        allOccupants: residents,
        residingOccupant,
        owner,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error fetching unit residents'
    res.status(500).json({ success: false, message })
  }
}

export async function getAllResidents(req: Request, res: Response): Promise<void> {
  try {
    const { locId, unitId, residentType, isResiding, search } = req.query

    const whereClause: Record<string, unknown> = { isDeleted: false }
    if (locId) whereClause.locId = locId
    if (unitId) whereClause.unitId = unitId
    if (residentType && residentType !== 'ALL') whereClause.residentType = residentType
    if (isResiding !== undefined && isResiding !== 'ALL') whereClause.isResiding = isResiding === 'true'

    if (search && typeof search === 'string' && search.trim().length > 0) {
      const q = `%${search.trim()}%`
      whereClause[Op.or as unknown as string] = [
        { firstName: { [Op.like]: q } },
        { lastName: { [Op.like]: q } },
        { username: { [Op.like]: q } },
        { phone: { [Op.like]: q } },
        { email: { [Op.like]: q } },
        { '$unit.unit_number$': { [Op.like]: q } },
      ]
    }

    const residents = await Resident.findAll({
      where: whereClause,
      include: [
        { model: Property, as: 'property' },
        {
          model: PropertyUnit,
          as: 'unit',
          include: [{ model: PropertyFloor, as: 'floor' }],
        },
        { model: ResidentFamilyMember, as: 'familyMembers', where: { isDeleted: false }, required: false },
        { model: Package, as: 'carePackage', required: false },
        {
          model: PackageSubscription,
          as: 'packageSubscriptions',
          required: false,
          where: { isDeleted: false },
          include: [{ model: PackageSubscriptionFeature, as: 'packageSubscriptionFeatures', required: false }],
        },
      ],
      order: [['createdAt', 'DESC']],
    })

    res.status(200).json({
      success: true,
      data: residents,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error fetching residents'
    res.status(500).json({ success: false, message })
  }
}

export async function getResidentById(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const resident = await Resident.findOne({
      where: { id, isDeleted: false },
      include: [
        { model: Property, as: 'property' },
        {
          model: PropertyUnit,
          as: 'unit',
          include: [{ model: PropertyFloor, as: 'floor' }],
        },
        { model: ResidentFamilyMember, as: 'familyMembers', where: { isDeleted: false }, required: false },
        { model: Package, as: 'carePackage', required: false },
        {
          model: PackageSubscription,
          as: 'packageSubscriptions',
          required: false,
          where: { isDeleted: false },
          include: [{ model: PackageSubscriptionFeature, as: 'packageSubscriptionFeatures', required: false }],
        },
      ],
    })

    if (!resident) {
      res.status(404).json({ success: false, message: 'Resident profile not found' })
      return
    }

    res.status(200).json({
      success: true,
      data: resident,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error fetching resident profile'
    res.status(500).json({ success: false, message })
  }
}

export async function updateResident(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const resident = await Resident.findByPk(id)

    if (!resident) {
      res.status(404).json({ success: false, message: 'Resident not found' })
      return
    }

    const {
      firstName,
      lastName,
      gender,
      dob,
      username,
      password,
      email,
      phone,
      emergencyContact,
      bloodGroup,
      photoUrl,
      moveOutDate,
      rentAmount,
      payRentToCompany,
      status,
      isResiding,
      carePackageId,
      taskSchedules: rawTaskSchedules,
      familyMembers,
    } = req.body

    let taskSchedules: Array<{ taskId: string; taskName?: string; frequency?: number; times?: string[] }> | undefined
    if (rawTaskSchedules) {
      taskSchedules = typeof rawTaskSchedules === 'string' ? JSON.parse(rawTaskSchedules) : rawTaskSchedules
    }

    const userPayload = (req as Request & { user?: { id?: string; userId?: string; username?: string } }).user
    let rawUserId = userPayload?.id || userPayload?.userId || null
    if (!rawUserId && req.headers.authorization?.startsWith('Bearer ')) {
      try {
        const decoded = verifyToken(req.headers.authorization.substring(7))
        if (decoded?.userId) {
          rawUserId = decoded.userId
        }
      } catch {
        // ignore invalid token
      }
    }

    let validUserId: string | null = null
    if (rawUserId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawUserId)
      if (isUuid) {
        const userExists = await User.findOne({ where: { id: rawUserId, isDeleted: false } })
        if (userExists) {
          validUserId = userExists.id
        }
      }
    }

    const operatorId = validUserId || userPayload?.username || 'system'
    const stoppedByUserId = validUserId
    const updatedResiding = isResiding !== undefined ? Boolean(isResiding) : resident.isResiding

    // Handle username uniqueness and password hashing for resident
    let updatedUsername = resident.username
    let updatedPasswordHash = resident.passwordHash

    if (username !== undefined) {
      const trimmedUsername = username ? String(username).trim() : null
      if (trimmedUsername && trimmedUsername !== resident.username) {
        const existingUser = await Resident.findOne({
          where: { username: trimmedUsername, isDeleted: false, id: { [Op.ne]: resident.id } },
        })
        const existingFm = await ResidentFamilyMember.findOne({
          where: { username: trimmedUsername, isDeleted: false },
        })
        if (existingUser || existingFm) {
          res.status(400).json({
            success: false,
            message: 'Username is already taken by another resident or family member.',
          })
          return
        }
        updatedUsername = trimmedUsername
      } else if (!trimmedUsername) {
        updatedUsername = null
      }
    }

    if (password) {
      updatedPasswordHash = await bcrypt.hash(String(password), 10)
    } else if (updatedUsername && !updatedPasswordHash) {
      updatedPasswordHash = await bcrypt.hash('Resident@123', 10)
    }

    const phoneRegex = /^[6-9]\d{9}$/
    if (phone) {
      const cleanPhone = String(phone).replace(/[\s-]/g, '')
      if (!phoneRegex.test(cleanPhone)) {
        res.status(400).json({
          success: false,
          message: 'Mobile phone must be a 10-digit number starting with 6, 7, 8, or 9.',
        })
        return
      }
    }

    if (emergencyContact) {
      const cleanEmergency = String(emergencyContact).replace(/[\s-]/g, '')
      if (!phoneRegex.test(cleanEmergency)) {
        res.status(400).json({
          success: false,
          message: 'Emergency contact phone must be a 10-digit number starting with 6, 7, 8, or 9.',
        })
        return
      }
    }

    let finalPhotoUrl = resident.photoUrl
    const uploadedFile =
      req.file ||
      (req.files && typeof req.files === 'object' && ('photo' in req.files || 'avatar' in req.files)
        ? (req.files as Record<string, Express.Multer.File[]>).photo?.[0] ||
          (req.files as Record<string, Express.Multer.File[]>).avatar?.[0]
        : undefined)

    if (uploadedFile) {
      const s3Res = await uploadFileToS3(uploadedFile, 'residents/avatars')
      finalPhotoUrl = s3Res.location
    } else if (photoUrl !== undefined) {
      finalPhotoUrl = await uploadBase64ToS3(photoUrl, 'residents/avatars')
    }

    // Handle Care Package update/assignment if provided
    let updatedCarePackageId = resident.carePackageId
    if (carePackageId !== undefined) {
      const trimmedPkgId = carePackageId && typeof carePackageId === 'string' ? carePackageId.trim() : null
      if (trimmedPkgId) {
        const pkg = await Package.findOne({
          where: { id: trimmedPkgId, isDeleted: false, isActive: true },
        })
        if (pkg) {
          updatedCarePackageId = pkg.id
          const currentActiveSub = await PackageSubscription.findOne({
            where: { residentId: resident.id, status: SubscriptionStatus.ACTIVE, isDeleted: false },
          })

          if (!currentActiveSub || currentActiveSub.carePackageId !== pkg.id) {
            const currentDate = new Date()

            if (currentActiveSub) {
              await currentActiveSub.update({
                status: SubscriptionStatus.INACTIVE,
                endDate: currentDate,
                isPrevious: true,
                updatedBy: operatorId,
              })

              await PackageSubscriptionFeature.update(
                { isDeleted: true, updatedBy: operatorId },
                { where: { packageSubscriptionId: currentActiveSub.id, isDeleted: false } },
              )
            }

            // Ensure all other active subscriptions for this resident are marked inactive with static endDate as current date
            await PackageSubscription.update(
              {
                status: SubscriptionStatus.INACTIVE,
                endDate: currentDate,
                isPrevious: true,
                updatedBy: operatorId,
              },
              {
                where: {
                  residentId: resident.id,
                  status: SubscriptionStatus.ACTIVE,
                  isDeleted: false,
                },
              },
            )

            // Cancel and soft delete all previous package care task assignments for this resident
            await CareTaskAssignment.update(
              {
                status: 'CANCELLED',
                isStopped: true,
                stoppedAt: new Date(),
                stoppedBy: stoppedByUserId,
                isActive: false,
                isDeleted: true,
                updatedBy: operatorId,
              },
              {
                where: {
                  residentId: resident.id,
                  source: 'PACKAGE',
                  isDeleted: false,
                },
              },
            )

            const newSub = await PackageSubscription.create({
              residentId: resident.id,
              carePackageId: pkg.id,
              propertyId: resident.locId,
              startDate: currentDate,
              endDate: null,
              totalCost: pkg.packageCost,
              status: SubscriptionStatus.ACTIVE,
              isPrevious: false,
              notes: `Assigned during resident update: ${pkg.packageName}`,
              createdBy: operatorId,
              updatedBy: operatorId,
            })

            const featureMappings = await CarePackageFeaturesMap.findAll({
              where: { carePackageId: pkg.id, isDeleted: false },
            })
            if (featureMappings.length > 0) {
              await PackageSubscriptionFeature.bulkCreate(
                featureMappings.map((fm) => ({
                  packageSubscriptionId: newSub.id,
                  featureId: fm.featureId,
                  complimentaryCount: Number(fm.complimentaryCount || 0),
                  remainingCount: Number(fm.complimentaryCount || 0),
                  createdBy: operatorId,
                  updatedBy: operatorId,
                })),
              )
            }
          }
        }
      } else {
        // Care package was cleared
        updatedCarePackageId = null
        const currentDate = new Date()

        const currentActiveSub = await PackageSubscription.findOne({
          where: { residentId: resident.id, status: SubscriptionStatus.ACTIVE, isDeleted: false },
        })
        if (currentActiveSub) {
          await currentActiveSub.update({
            status: SubscriptionStatus.INACTIVE,
            endDate: currentDate,
            isPrevious: true,
            updatedBy: operatorId,
          })

          await PackageSubscriptionFeature.update(
            { isDeleted: true, updatedBy: operatorId },
            { where: { packageSubscriptionId: currentActiveSub.id, isDeleted: false } },
          )
        }

        // Ensure all other active subscriptions for this resident are marked inactive with static endDate as current date
        await PackageSubscription.update(
          {
            status: SubscriptionStatus.INACTIVE,
            endDate: currentDate,
            isPrevious: true,
            updatedBy: operatorId,
          },
          {
            where: {
              residentId: resident.id,
              status: SubscriptionStatus.ACTIVE,
              isDeleted: false,
            },
          },
        )

        // Cancel and soft delete all previous package care task assignments for this resident
        await CareTaskAssignment.update(
          {
            status: 'CANCELLED',
            isStopped: true,
            stoppedAt: new Date(),
            stoppedBy: stoppedByUserId,
            isActive: false,
            isDeleted: true,
            updatedBy: operatorId,
          },
          {
            where: {
              residentId: resident.id,
              source: 'PACKAGE',
              isDeleted: false,
            },
          },
        )
      }
    }

    await resident.update({
      firstName: firstName ? firstName.trim() : resident.firstName,
      lastName: lastName !== undefined ? lastName : resident.lastName,
      gender: gender !== undefined ? gender : resident.gender,
      dob: dob !== undefined ? dob : resident.dob,
      username: updatedUsername,
      passwordHash: updatedPasswordHash,
      email: email !== undefined ? email : resident.email,
      phone: phone !== undefined ? phone : resident.phone,
      emergencyContact: emergencyContact !== undefined ? emergencyContact : resident.emergencyContact,
      bloodGroup: bloodGroup !== undefined ? bloodGroup : resident.bloodGroup,
      photoUrl: finalPhotoUrl,
      moveOutDate: moveOutDate !== undefined ? moveOutDate : resident.moveOutDate,
      rentAmount:
        rentAmount !== undefined
          ? rentAmount !== null && rentAmount !== ''
            ? Number(rentAmount)
            : null
          : resident.rentAmount,
      payRentToCompany: payRentToCompany !== undefined ? Boolean(payRentToCompany) : resident.payRentToCompany,
      status: status || resident.status,
      isResiding: updatedResiding,
      carePackageId: updatedCarePackageId,
      updatedBy: operatorId,
    })

    // If resident has a care package, sync and insert any missing care task assignments
    if (updatedCarePackageId) {
      await syncPackageTasksForResidents(resident.id, resident.locId, taskSchedules)
    }

    // Sync Family Members if provided
    if (Array.isArray(familyMembers)) {
      await ResidentFamilyMember.destroy({ where: { residentId: resident.id } })
      if (familyMembers.length > 0) {
        const familyMemberRecords = await Promise.all(
          familyMembers.map(async (fm) => {
            let fmPasswordHash: string | null = null
            if (fm.username) {
              const rawPass = fm.password || 'Resident@123'
              fmPasswordHash = await bcrypt.hash(rawPass, 10)
            }

            const fmResiding = updatedResiding
            const fmPhotoUrl = await uploadBase64ToS3(fm.photoUrl, 'residents/avatars')

            return {
              residentId: resident.id,
              firstName: fm.firstName.trim(),
              lastName: fm.lastName ? fm.lastName.trim() : null,
              relation: fm.relation ? fm.relation.trim() : 'Family',
              isResiding: fmResiding,
              gender: fm.gender || null,
              dob: fm.dob || null,
              bloodGroup: fm.bloodGroup || null,
              photoUrl: fmPhotoUrl,
              phone: fm.phone ? fm.phone.trim() : null,
              username: fm.username ? fm.username.trim() : null,
              passwordHash: fmPasswordHash,
              email: fm.email ? fm.email.trim() : null,
              createdBy: operatorId,
              updatedBy: operatorId,
              isDeleted: false,
            }
          }),
        )
        await ResidentFamilyMember.bulkCreate(familyMemberRecords)
      }
    } else if (!updatedResiding) {
      // If owner changed to non-residing, update existing family members to non-residing as well
      await ResidentFamilyMember.update({ isResiding: false }, { where: { residentId: resident.id } })
    }

    // Re-evaluate PropertyUnit OccupancyStatus
    const activeResiding = await Resident.findOne({
      where: { unitId: resident.unitId, isResiding: true, isDeleted: false },
    })

    const unit = await PropertyUnit.findByPk(resident.unitId)
    if (unit) {
      if (!activeResiding) {
        await unit.update({ occupancyStatus: OccupancyStatus.VACANT })
      } else if (activeResiding.residentType === ResidentType.OWNER) {
        await unit.update({ occupancyStatus: OccupancyStatus.OWNER_OCCUPIED })
      } else if (activeResiding.residentType === ResidentType.TENANT) {
        await unit.update({ occupancyStatus: OccupancyStatus.TENANT_OCCUPIED })
      }
    }

    const updatedRecord = await Resident.findByPk(resident.id, {
      include: [
        { model: PropertyUnit, as: 'unit' },
        { model: Package, as: 'carePackage', required: false },
        { model: ResidentFamilyMember, as: 'familyMembers', where: { isDeleted: false }, required: false },
      ],
    })

    res.status(200).json({
      success: true,
      message: 'Resident updated successfully',
      data: updatedRecord,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error updating resident'
    res.status(500).json({ success: false, message })
  }
}

export async function deleteResident(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const resident = await Resident.findByPk(id)

    if (!resident) {
      res.status(404).json({ success: false, message: 'Resident not found' })
      return
    }

    await resident.update({ isDeleted: true, isResiding: false })

    // Soft delete associated family members
    await ResidentFamilyMember.update({ isDeleted: true }, { where: { residentId: resident.id } })

    // Re-evaluate PropertyUnit OccupancyStatus
    const activeResiding = await Resident.findOne({
      where: { unitId: resident.unitId, isResiding: true, isDeleted: false },
    })

    const unit = await PropertyUnit.findByPk(resident.unitId)
    if (unit) {
      if (!activeResiding) {
        await unit.update({ occupancyStatus: OccupancyStatus.VACANT })
      } else if (activeResiding.residentType === ResidentType.OWNER) {
        await unit.update({ occupancyStatus: OccupancyStatus.OWNER_OCCUPIED })
      } else if (activeResiding.residentType === ResidentType.TENANT) {
        await unit.update({ occupancyStatus: OccupancyStatus.TENANT_OCCUPIED })
      }
    }

    res.status(200).json({
      success: true,
      message: 'Resident removed successfully',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error deleting resident'
    res.status(500).json({ success: false, message })
  }
}

export async function getResidentBillingData(req: Request, res: Response): Promise<void> {
  try {
    const residentId = (req.params.id || req.query.residentId || req.query.id) as string
    if (!residentId) {
      res.status(400).json({ success: false, message: 'Resident ID is required' })
      return
    }

    const resident = await Resident.findOne({
      where: { id: residentId, isDeleted: false },
      include: [
        {
          model: Property,
          as: 'property',
        },
        {
          model: PropertyUnit,
          as: 'unit',
        },
        {
          model: Package,
          as: 'carePackage',
        },
      ],
    })

    if (!resident) {
      res.status(404).json({ success: false, message: 'Resident not found' })
      return
    }

    // Determine target month and year from query params or current date
    const now = new Date()
    let targetYear = now.getFullYear()
    let targetMonth = now.getMonth() + 1 // 1-12

    if (req.query.year) {
      const y = parseInt(req.query.year as string, 10)
      if (!isNaN(y) && y > 2000) targetYear = y
    }
    if (req.query.month) {
      const m = parseInt(req.query.month as string, 10)
      if (!isNaN(m) && m >= 1 && m <= 12) targetMonth = m
    }

    const daysInMonth = new Date(targetYear, targetMonth, 0).getDate()
    const monthStartStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`
    const monthEndStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

    interface ResidentBillingServiceItem {
      id: string
      name: string
      category: string
      description: string
      quantity: string | number
      price: number
      total: number
      monthlyPrice?: number | undefined
      type: string
      isEditable: boolean
      date?: string | Date | undefined
      formattedDate?: string | undefined
      nurseName?: string | null | undefined
    }

    // Check move-in date for proration
    let isProrated = false
    let billableDays = daysInMonth
    let periodStartStr = monthStartStr

    if (resident.moveInDate) {
      const moveIn = new Date(resident.moveInDate)
      const moveInYear = moveIn.getFullYear()
      const moveInMonth = moveIn.getMonth() + 1
      const moveInDay = moveIn.getDate()

      if (moveInYear === targetYear && moveInMonth === targetMonth) {
        billableDays = daysInMonth - moveInDay + 1
        if (billableDays < daysInMonth && billableDays > 0) {
          isProrated = true
          periodStartStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(moveInDay).padStart(2, '0')}`
        }
      } else if (moveIn > new Date(targetYear, targetMonth - 1, daysInMonth)) {
        // Resident moves in future month
        billableDays = 0
      }
    }

    const unitNumber = resident.unit?.unit_number || 'Unit'
    const propertyName = resident.property?.property_name || ''

    const services: ResidentBillingServiceItem[] = []

    // 1. Care Packages (Advance & Refund / Credit Reconciliation)
    const monthSubscriptions = await PackageSubscription.findAll({
      where: {
        residentId: resident.id,
        isDeleted: false,
        startDate: { [Op.lte]: monthEndStr },
        [Op.or]: [{ endDate: null }, { endDate: { [Op.gte]: monthStartStr } }],
      },
      include: [{ model: Package, as: 'carePackage' }],
      order: [
        ['startDate', 'ASC'],
        ['createdAt', 'ASC'],
      ],
    })

    let activeDisplayPkg: Package | null = null

    if (monthSubscriptions.length > 0 && billableDays > 0) {
      for (const sub of monthSubscriptions) {
        const carePkg = sub.carePackage
        if (!carePkg) continue

        const pkgMonthlyPrice = Number(carePkg.packageCost || sub.totalCost || 0)
        const dailyPkgRate = Math.round((pkgMonthlyPrice / daysInMonth) * 100) / 100

        const rawSubStartStr = sub.startDate ? new Date(sub.startDate).toISOString().slice(0, 10) : monthStartStr
        const effStartStr = rawSubStartStr > periodStartStr ? rawSubStartStr : periodStartStr

        const isActive = sub.status === SubscriptionStatus.ACTIVE && !sub.endDate
        if (isActive) {
          activeDisplayPkg = carePkg
          const activeDays = Math.max(
            0,
            Math.round((new Date(monthEndStr).getTime() - new Date(effStartStr).getTime()) / (1000 * 60 * 60 * 24)) + 1,
          )
          const isSubProrated = activeDays < daysInMonth

          if (isSubProrated) {
            const proratedPkgTotal = Math.round(activeDays * dailyPkgRate * 100) / 100
            services.push({
              id: `package-advance-${sub.id}`,
              name: `Care Package (${carePkg.packageName})`,
              category: 'Advance',
              description: `${carePkg.packageName} - Prorated (${effStartStr} to ${monthEndStr})`,
              quantity: `${activeDays} Days`,
              price: dailyPkgRate,
              total: proratedPkgTotal,
              monthlyPrice: pkgMonthlyPrice,
              type: 'PACKAGE',
              isEditable: false,
              date: effStartStr,
            })
          } else {
            services.push({
              id: `package-advance-${sub.id}`,
              name: `Care Package (${carePkg.packageName})`,
              category: 'Advance',
              description: `${carePkg.packageName} (${monthStartStr} to ${monthEndStr})`,
              quantity: '1 month',
              price: pkgMonthlyPrice,
              total: pkgMonthlyPrice,
              monthlyPrice: pkgMonthlyPrice,
              type: 'PACKAGE',
              isEditable: false,
              date: monthStartStr,
            })
          }
        } else {
          // Inactive / Changed / Stopped subscription in this month
          if (!activeDisplayPkg) {
            activeDisplayPkg = carePkg
          }
          const rawSubEndStr = sub.endDate
            ? new Date(sub.endDate).toISOString().slice(0, 10)
            : sub.updatedAt
              ? new Date(sub.updatedAt).toISOString().slice(0, 10)
              : monthEndStr
          const effEndStr = rawSubEndStr < monthEndStr ? rawSubEndStr : monthEndStr

          // Scheduled advance days for this package in the month
          const scheduledBilledDays = Math.max(
            0,
            Math.round((new Date(monthEndStr).getTime() - new Date(effStartStr).getTime()) / (1000 * 60 * 60 * 24)) + 1,
          )
          const scheduledTotal = Math.round(scheduledBilledDays * dailyPkgRate * 100) / 100

          services.push({
            id: `package-advance-${sub.id}`,
            name: `Care Package (${carePkg.packageName})`,
            category: 'Advance',
            description:
              scheduledBilledDays < daysInMonth
                ? `${carePkg.packageName} - Prorated (${effStartStr} to ${monthEndStr})`
                : `${carePkg.packageName} (${monthStartStr} to ${monthEndStr})`,
            quantity: scheduledBilledDays < daysInMonth ? `${scheduledBilledDays} Days` : '1 month',
            price: dailyPkgRate,
            total: scheduledTotal,
            monthlyPrice: pkgMonthlyPrice,
            type: 'PACKAGE',
            isEditable: false,
            date: effStartStr,
          })

          // Actual days utilized
          const daysUtilized = Math.max(
            1,
            Math.round((new Date(effEndStr).getTime() - new Date(effStartStr).getTime()) / (1000 * 60 * 60 * 24)) + 1,
          )
          const unusedDays = Math.max(0, scheduledBilledDays - daysUtilized)

          if (unusedDays > 0) {
            const unusedStartDate = new Date(effEndStr)
            unusedStartDate.setDate(unusedStartDate.getDate() + 1)
            const unusedStartStr = unusedStartDate.toISOString().slice(0, 10)
            const refundAmt = Math.round(unusedDays * dailyPkgRate * 100) / 100

            services.push({
              id: `package-refund-${sub.id}`,
              name: `Refund: Care Package (${carePkg.packageName})`,
              category: 'Refund',
              description: `Credit for ${unusedDays} unused day(s) (${unusedStartStr} to ${monthEndStr})`,
              quantity: `${unusedDays} Days`,
              price: dailyPkgRate,
              total: -refundAmt,
              monthlyPrice: pkgMonthlyPrice,
              type: 'REFUND',
              isEditable: false,
              date: unusedStartStr,
            })
          }
        }
      }
    } else if (resident.carePackage && billableDays > 0) {
      // Fallback if no subscriptions exist in package_subscriptions table
      const carePkg = resident.carePackage
      activeDisplayPkg = carePkg
      const pkgMonthlyPrice = Number(carePkg.packageCost) || 0
      if (isProrated) {
        const dailyPkgRate = Math.round((pkgMonthlyPrice / daysInMonth) * 100) / 100
        const proratedPkgTotal = Math.round(billableDays * dailyPkgRate * 100) / 100
        services.push({
          id: `package-${carePkg.id}`,
          name: `Care Package (${carePkg.packageName})`,
          category: 'Advance',
          description: `${carePkg.packageName} - Prorated (${periodStartStr} to ${monthEndStr})`,
          quantity: `${billableDays} Days`,
          price: dailyPkgRate,
          total: proratedPkgTotal,
          monthlyPrice: pkgMonthlyPrice,
          type: 'PACKAGE',
          isEditable: false,
          date: periodStartStr,
        })
      } else {
        services.push({
          id: `package-${carePkg.id}`,
          name: `Care Package (${carePkg.packageName})`,
          category: 'Advance',
          description: `${carePkg.packageName} (${monthStartStr} to ${monthEndStr})`,
          quantity: '1 month',
          price: pkgMonthlyPrice,
          total: pkgMonthlyPrice,
          monthlyPrice: pkgMonthlyPrice,
          type: 'PACKAGE',
          isEditable: false,
          date: monthStartStr,
        })
      }
    }

    // 2. Additional Tasks Done (exclusive of subscribed package) / Add-ons
    const monthStartDate = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0, 0)
    const monthEndDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999)

    const additionalCharges = await AdditionalTaskCharge.findAll({
      where: {
        residentId: resident.id,
        isDeleted: false,
        [Op.or]: [
          {
            completedAt: {
              [Op.between]: [monthStartDate, monthEndDate],
            },
          },
          {
            createdAt: {
              [Op.between]: [monthStartDate, monthEndDate],
            },
          },
        ],
      } as WhereOptions,
      include: [
        { model: CareTask, as: 'feature' },
        {
          model: User,
          as: 'nurse',
          attributes: ['id', 'username'],
          include: [
            {
              model: UserDetail,
              as: 'profile',
              attributes: ['firstName', 'lastName'],
              required: false,
            },
          ],
          required: false,
        },
      ],
      order: [['completedAt', 'DESC']],
    })

    // Group identical additional tasks by (featureId or taskName) + unitPrice
    interface GroupedAddon {
      id: string
      name: string
      category: string
      description: string
      quantity: number
      price: number
      total: number
      type: string
      isEditable: boolean
      date: string
      formattedDate: string
      nurseName: string | null
      nurseNames: Set<string>
      count: number
    }

    const groupedAddons = new Map<string, GroupedAddon>()

    for (const charge of additionalCharges) {
      const chargeDate = charge.completedAt ? new Date(charge.completedAt) : new Date(charge.createdAt)
      const chargeDateStr = chargeDate.toISOString().slice(0, 10)
      const formattedDate = chargeDate.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
      const nurseObj = charge.nurse as (User & { profile?: UserDetail }) | undefined
      const nurseName = nurseObj?.profile?.firstName
        ? `${nurseObj.profile.firstName} ${nurseObj.profile.lastName || ''}`.trim()
        : nurseObj?.username || null

      const unitPrice =
        charge.unitPrice != null && Number(charge.unitPrice) > 0 ? Number(charge.unitPrice) : Number(charge.price)
      const chargeTotal = Number(charge.price) || unitPrice
      const qty = unitPrice > 0 ? Math.round(chargeTotal / unitPrice) || 1 : 1
      const taskName = charge.taskName || charge.feature?.careTaskName || 'Care Task Session'

      const groupKey = charge.featureId
        ? `feature_${charge.featureId}_${unitPrice}`
        : `name_${taskName.trim().toLowerCase()}_${unitPrice}`

      if (!groupedAddons.has(groupKey)) {
        const nurseSet = new Set<string>()
        if (nurseName) nurseSet.add(nurseName)

        groupedAddons.set(groupKey, {
          id: `task-charge-${charge.id}`,
          name: taskName,
          category: 'Add-on',
          description: charge.description || `Additional Care Task (${taskName})`,
          quantity: qty,
          price: unitPrice,
          total: chargeTotal,
          type: 'ADDITIONAL_TASK',
          isEditable: false,
          date: chargeDateStr,
          formattedDate,
          nurseName,
          nurseNames: nurseSet,
          count: 1,
        })
      } else {
        const existing = groupedAddons.get(groupKey)!
        existing.quantity += qty
        existing.total += chargeTotal
        existing.count += 1
        if (nurseName) {
          existing.nurseNames.add(nurseName)
          existing.nurseName = Array.from(existing.nurseNames).join(', ')
        }
      }
    }

    for (const addon of groupedAddons.values()) {
      services.push({
        id: addon.id,
        name: addon.name,
        category: addon.category,
        description: addon.description,
        quantity: addon.quantity,
        price: addon.price,
        total: Math.round(addon.total * 100) / 100,
        type: addon.type,
        isEditable: addon.isEditable,
        date: addon.date,
        formattedDate: addon.formattedDate,
        nurseName: addon.nurseName,
      })
    }

    const refundTotal = services
      .filter((s) => s.category === 'Refund' || s.type === 'REFUND' || (Number(s.total) || 0) < 0)
      .reduce((sum, s) => sum + Math.abs(Number(s.total) || 0), 0)

    const grossTotal = services
      .filter((s) => (Number(s.total) || 0) > 0)
      .reduce((sum, s) => sum + (Number(s.total) || 0), 0)

    const subtotal = Math.max(0, grossTotal - refundTotal)

    res.status(200).json({
      success: true,
      message: 'Billing data fetched successfully',
      data: {
        resident: {
          id: resident.id,
          firstName: resident.firstName,
          lastName: resident.lastName,
          fullName: `${resident.firstName} ${resident.lastName || ''}`.trim(),
          residentType: resident.residentType,
          status: resident.status,
          unitNumber,
          unitId: resident.unitId,
          propertyName,
          moveInDate: resident.moveInDate,
          package: activeDisplayPkg
            ? { id: activeDisplayPkg.id, name: activeDisplayPkg.packageName, price: activeDisplayPkg.packageCost }
            : null,
        },
        billingMode: 'MONTHLY',
        invoice: {
          admissionDate: resident.moveInDate ? new Date(resident.moveInDate).toISOString().slice(0, 10) : null,
          startDate: monthStartStr,
          endDate: monthEndStr,
          periodStartDate: periodStartStr,
          periodEndDate: monthEndStr,
          billableDays,
          daysInMonth,
          isProrated,
          services,
          additionalTasksCount: additionalCharges.length,
          additionalTasksTotal: additionalCharges.reduce((s, c) => s + (Number(c.price) || 0), 0),
          grossTotal: Math.round(grossTotal * 100) / 100,
          refundTotal: Math.round(refundTotal * 100) / 100,
          subtotal: Math.round(subtotal * 100) / 100,
          total: Math.round(subtotal * 100) / 100,
          currency: 'INR',
        },
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error fetching billing data'
    res.status(500).json({ success: false, message })
  }
}
