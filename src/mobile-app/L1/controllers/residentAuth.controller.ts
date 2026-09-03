import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { Op } from 'sequelize'
import {
  FnbGlobalMealSlot,
  FnbGlobalPackage,
  FnbPropertyPackage,
  FnbResidentPackage,
  Property,
  PropertyBlock,
  PropertyFloor,
  PropertyUnit,
  Resident,
  ResidentFamilyMember,
} from '../../../models/index.js'
import { generateToken, verifyToken } from '../../../utils/jwt.js'
import { uploadFileToS3, uploadBase64ToS3 } from '../../../middlewares/s3/index.js'

interface PkgType {
  id?: string
  residentId?: string
  familyMemberId?: string
  status?: string
  startDate?: string
  endDate?: string
  dietaryPreference?: string
  propertyPackage?: {
    globalPackage?: {
      name?: string
      code?: string
      dietaryType?: string
      includedMealSlots?: string[]
    }
  }
}

export async function residentLogin(req: Request, res: Response): Promise<void> {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      res.status(400).json({
        success: false,
        message: 'Please provide resident username and password.',
      })
      return
    }

    const trimmedUsername = (username as string).trim()

    // 1. Try finding primary resident first
    const resident = await Resident.findOne({
      where: {
        username: trimmedUsername,
        isDeleted: false,
      },
      include: [
        {
          model: PropertyUnit,
          as: 'unit',
          include: [
            {
              model: PropertyFloor,
              as: 'floor',
              include: [{ model: PropertyBlock, as: 'block', include: [{ model: Property, as: 'property' }] }],
            },
          ],
        },
        { model: Property, as: 'property' },
        { model: ResidentFamilyMember, as: 'familyMembers', where: { isDeleted: false }, required: false },
      ],
    })

    if (!resident || !resident.passwordHash) {
      // 2. Try finding in resident_family_members table
      const familyMember = await ResidentFamilyMember.findOne({
        where: { username: trimmedUsername, isDeleted: false },
        include: [
          {
            model: Resident,
            as: 'resident',
            include: [
              { model: PropertyUnit, as: 'unit' },
              { model: ResidentFamilyMember, as: 'familyMembers', where: { isDeleted: false }, required: false },
            ],
          },
        ],
      })

      if (!familyMember || !familyMember.passwordHash || !familyMember.resident) {
        res.status(401).json({
          success: false,
          message: 'Invalid resident credentials.',
        })
        return
      }

      const isMatchFm = await bcrypt.compare(password, familyMember.passwordHash)
      if (!isMatchFm) {
        res.status(401).json({
          success: false,
          message: 'Invalid resident credentials.',
        })
        return
      }

      const parentResident = familyMember.resident
      const token = generateToken({
        userId: familyMember.id,
        email: familyMember.email || parentResident.email,
        companyId: parentResident.companyId,
        defaultLocationId: parentResident.locId,
        roles: ['RESIDENT_FAMILY_MEMBER'],
      })

      res.status(200).json({
        success: true,
        message: 'Family member mobile login successful',
        data: {
          token,
          resident: {
            id: familyMember.id,
            residentId: parentResident.id,
            unitId: parentResident.unitId,
            locId: parentResident.locId,
            residentType: 'FAMILY_MEMBER',
            relation: familyMember.relation,
            isResiding: true,
            firstName: familyMember.firstName,
            lastName: familyMember.lastName,
            username: familyMember.username,
            email: familyMember.email,
            phone: familyMember.phone,
            unit: parentResident.unit,
            familyMembers: (parentResident.familyMembers || []).filter((fm: ResidentFamilyMember) => !fm.isDeleted),
          },
        },
      })
      return
    }

    if (resident.status !== 'ACTIVE' || !resident.isActive) {
      res.status(403).json({
        success: false,
        message: 'Resident account is pending approval or inactive.',
      })
      return
    }

    const isMatch = await bcrypt.compare(password, resident.passwordHash)
    if (!isMatch) {
      res.status(401).json({
        success: false,
        message: 'Invalid resident credentials.',
      })
      return
    }

    const token = generateToken({
      userId: resident.id,
      email: resident.email,
      companyId: resident.companyId,
      defaultLocationId: resident.locId,
      roles: ['RESIDENT'],
    })

    res.status(200).json({
      success: true,
      message: 'Resident mobile login successful',
      data: {
        token,
        resident: {
          id: resident.id,
          unitId: resident.unitId,
          locId: resident.locId,
          residentType: resident.residentType,
          ownershipType: resident.ownershipType,
          isResiding: resident.isResiding,
          firstName: resident.firstName,
          lastName: resident.lastName,
          gender: resident.gender,
          dob: resident.dob,
          username: resident.username,
          email: resident.email,
          phone: resident.phone,
          status: resident.status,
          unit: resident.unit,
          familyMembers: (resident.familyMembers || []).filter((fm: ResidentFamilyMember) => !fm.isDeleted),
        },
      },
    })
  } catch (error) {
    console.error('Error in resident mobile login:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to process resident login request.',
    })
  }
}

const formatSinglePackage = (activePkg?: PkgType | null, slotNameMap?: Map<string, string>) => {
  if (!activePkg) return null
  const gp = activePkg.propertyPackage?.globalPackage
  const rawSlots = gp?.includedMealSlots || []
  const formattedSlots = rawSlots.map((slotIdOrName: string) => {
    if (slotNameMap && slotNameMap.has(slotIdOrName)) {
      return slotNameMap.get(slotIdOrName)!
    }
    return slotIdOrName
  })

  return {
    id: activePkg.id,
    name: gp?.name || 'Standard Meal Package',
    code: gp?.code || 'FNB-PKG',
    dietaryType: gp?.dietaryType || activePkg.dietaryPreference || 'Standard',
    includedMealSlots: formattedSlots,
    status: activePkg.status || 'active',
    startDate: activePkg.startDate,
    endDate: activePkg.endDate || null,
  }
}

const formatPropertyDetails = (residentObj: unknown) => {
  const r = residentObj as { unit?: Record<string, unknown>; property?: Record<string, unknown> } | null | undefined
  const unit = r?.unit
  const floor = unit?.floor as Record<string, unknown> | undefined
  const block = floor?.block as Record<string, unknown> | undefined
  const prop = (r?.property || block?.property) as Record<string, unknown> | undefined

  return {
    id: unit?.id || null,
    flatNumber: unit?.unit_number || 'N/A',
    unitType: unit?.unit_type || 'N/A',
    floorName: floor?.floor_name || (floor?.floor_number !== undefined ? `Floor ${floor.floor_number}` : 'N/A'),
    blockName: block?.block_name || 'N/A',
    propertyName: prop?.property_name || 'N/A',
  }
}

export async function getResidentProfile(req: Request, res: Response): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Authentication required' })
      return
    }
    const token = authHeader.substring(7)
    const decoded = verifyToken(token)

    const fullUnitInclude = {
      model: PropertyUnit,
      as: 'unit',
      include: [
        {
          model: PropertyFloor,
          as: 'floor',
          include: [{ model: PropertyBlock, as: 'block', include: [{ model: Property, as: 'property' }] }],
        },
      ],
    }

    if (decoded.roles?.includes('RESIDENT_FAMILY_MEMBER')) {
      const familyMember = await ResidentFamilyMember.findByPk(decoded.userId, {
        include: [
          {
            model: Resident,
            as: 'resident',
            include: [
              fullUnitInclude,
              { model: Property, as: 'property' },
              {
                model: ResidentFamilyMember,
                as: 'familyMembers',
                where: { isDeleted: false },
                required: false,
              },
            ],
          },
        ],
      })
      if (!familyMember || !familyMember.resident) {
        res.status(404).json({ success: false, message: 'Profile not found' })
        return
      }
      const parent = familyMember.resident

      const globalSlots = await FnbGlobalMealSlot.findAll()
      const slotNameMap = new Map<string, string>()
      globalSlots.forEach((gs) => {
        if (gs.id) slotNameMap.set(gs.id, gs.name)
      })

      const fmList = (parent.familyMembers || []) as ResidentFamilyMember[]
      const fmIds = fmList.map((fm) => fm.id)

      // Fetch all active F&B packages for this resident unit/family
      const allActivePackages = await FnbResidentPackage.findAll({
        where: {
          [Op.or]: [
            { residentId: parent.id },
            { familyMemberId: parent.id },
            ...(fmIds.length > 0 ? [{ familyMemberId: fmIds }] : []),
          ],
          status: ['active', 'ACTIVE', 'paused', 'PAUSED'],
        },
        include: [
          {
            model: FnbPropertyPackage,
            as: 'propertyPackage',
            include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
          },
        ],
      })

      const familyPackageMap = new Map<string, PkgType>()
      let primaryResidentPackage: PkgType | null = null

      allActivePackages.forEach((pkgItem: unknown) => {
        const pkg = pkgItem as PkgType
        if (pkg.familyMemberId) {
          familyPackageMap.set(pkg.familyMemberId, pkg)
        }
        if (pkg.residentId === parent.id && !pkg.familyMemberId) {
          primaryResidentPackage = pkg
        }
      })

      const familyMemberPkg = familyPackageMap.get(familyMember.id) || primaryResidentPackage

      res.status(200).json({
        success: true,
        data: {
          id: familyMember.id,
          residentId: parent.id,
          unitId: parent.unitId,
          locId: parent.locId,
          residentType: 'FAMILY_MEMBER',
          relation: familyMember.relation,
          isResiding: true,
          firstName: familyMember.firstName,
          lastName: familyMember.lastName,
          username: familyMember.username,
          email: familyMember.email,
          phone: familyMember.phone,
          unit: parent.unit,
          propertyDetails: formatPropertyDetails(parent),
          foodPackage: formatSinglePackage(familyMemberPkg, slotNameMap),
          primaryResident: {
            id: parent.id,
            firstName: parent.firstName,
            lastName: parent.lastName,
            email: parent.email,
            phone: parent.phone,
            foodPackage: formatSinglePackage(primaryResidentPackage, slotNameMap),
          },
          familyMembers: (parent.familyMembers || [])
            .filter((fm: ResidentFamilyMember) => !fm.isDeleted)
            .map((fm: ResidentFamilyMember) => ({
              id: fm.id,
              firstName: fm.firstName,
              lastName: fm.lastName,
              relation: fm.relation,
              isResiding: fm.isResiding,
              gender: fm.gender,
              dob: fm.dob,
              phone: fm.phone,
              email: fm.email,
              username: fm.username,
              bloodGroup: fm.bloodGroup,
              foodPackage: formatSinglePackage(familyPackageMap.get(fm.id) || primaryResidentPackage, slotNameMap),
            })),
        },
      })
      return
    }

    const resident = await Resident.findByPk(decoded.userId, {
      include: [
        fullUnitInclude,
        { model: Property, as: 'property' },
        {
          model: ResidentFamilyMember,
          as: 'familyMembers',
          where: { isDeleted: false },
          required: false,
        },
      ],
    })

    if (!resident) {
      res.status(404).json({ success: false, message: 'Resident profile not found' })
      return
    }

    const globalSlots = await FnbGlobalMealSlot.findAll()
    const slotNameMap = new Map<string, string>()
    globalSlots.forEach((gs) => {
      if (gs.id) slotNameMap.set(gs.id, gs.name)
    })

    const fmList = (resident.familyMembers || []) as ResidentFamilyMember[]
    const fmIds = fmList.map((fm) => fm.id)

    // Fetch all active F&B packages for this resident unit/family
    const allActivePackages = await FnbResidentPackage.findAll({
      where: {
        [Op.or]: [
          { residentId: resident.id },
          { familyMemberId: resident.id },
          ...(fmIds.length > 0 ? [{ familyMemberId: fmIds }] : []),
        ],
        status: ['active', 'ACTIVE', 'paused', 'PAUSED'],
      },
      include: [
        {
          model: FnbPropertyPackage,
          as: 'propertyPackage',
          include: [{ model: FnbGlobalPackage, as: 'globalPackage' }],
        },
      ],
    })

    const familyPackageMap = new Map<string, PkgType>()
    let primaryResidentPackage: PkgType | null = null

    allActivePackages.forEach((pkgItem: unknown) => {
      const pkg = pkgItem as PkgType
      if (pkg.familyMemberId) {
        familyPackageMap.set(pkg.familyMemberId, pkg)
      }
      if (pkg.residentId === resident.id && !pkg.familyMemberId) {
        primaryResidentPackage = pkg
      }
    })

    res.status(200).json({
      success: true,
      data: {
        id: resident.id,
        unitId: resident.unitId,
        locId: resident.locId,
        residentType: resident.residentType,
        ownershipType: resident.ownershipType,
        isResiding: resident.isResiding,
        firstName: resident.firstName,
        lastName: resident.lastName,
        gender: resident.gender,
        dob: resident.dob,
        username: resident.username,
        email: resident.email,
        phone: resident.phone,
        status: resident.status,
        unit: resident.unit,
        photoUrl: resident.photoUrl || null,
        propertyDetails: formatPropertyDetails(resident),
        foodPackage: formatSinglePackage(primaryResidentPackage, slotNameMap),
        familyMembers: (resident.familyMembers || [])
          .filter((fm: ResidentFamilyMember) => !fm.isDeleted)
          .map((fm: ResidentFamilyMember) => ({
            id: fm.id,
            firstName: fm.firstName,
            lastName: fm.lastName,
            relation: fm.relation,
            isResiding: fm.isResiding,
            gender: fm.gender,
            dob: fm.dob,
            phone: fm.phone,
            email: fm.email,
            username: fm.username,
            bloodGroup: fm.bloodGroup,
            photoUrl: fm.photoUrl || null,
            foodPackage: formatSinglePackage(familyPackageMap.get(fm.id) || primaryResidentPackage, slotNameMap),
          })),
      },
    })
  } catch (err) {
    console.error('Error fetching resident profile:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch profile' })
  }
}

export async function updateResidentProfile(req: Request, res: Response): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Authentication required' })
      return
    }
    const token = authHeader.substring(7)
    const decoded = verifyToken(token)

    let photoUrl: string | null = req.body.photoUrl || req.body.photo_url || null
    if (req.file) {
      const s3Res = await uploadFileToS3(req.file, 'residents/avatars')
      photoUrl = s3Res.location
    } else if (photoUrl) {
      photoUrl = await uploadBase64ToS3(photoUrl, 'residents/avatars')
    }

    if (decoded.roles?.includes('RESIDENT_FAMILY_MEMBER')) {
      const familyMember = await ResidentFamilyMember.findByPk(decoded.userId)
      if (!familyMember) {
        res.status(404).json({ success: false, message: 'Family member profile not found' })
        return
      }
      await familyMember.update({
        ...(photoUrl && { photoUrl }),
        ...(req.body.firstName && { firstName: req.body.firstName }),
        ...(req.body.lastName !== undefined && { lastName: req.body.lastName }),
        ...(req.body.phone !== undefined && { phone: req.body.phone }),
        ...(req.body.email !== undefined && { email: req.body.email }),
      })
      res.status(200).json({ success: true, message: 'Profile updated successfully', data: familyMember })
      return
    }

    const resident = await Resident.findByPk(decoded.userId)
    if (!resident) {
      res.status(404).json({ success: false, message: 'Resident profile not found' })
      return
    }

    await resident.update({
      ...(photoUrl && { photoUrl }),
      ...(req.body.firstName && { firstName: req.body.firstName }),
      ...(req.body.lastName !== undefined && { lastName: req.body.lastName }),
      ...(req.body.phone !== undefined && { phone: req.body.phone }),
      ...(req.body.email !== undefined && { email: req.body.email }),
    })

    res.status(200).json({ success: true, message: 'Profile updated successfully', data: resident })
  } catch (err) {
    console.error('Error updating resident profile:', err)
    res.status(500).json({ success: false, message: 'Failed to update profile' })
  }
}
