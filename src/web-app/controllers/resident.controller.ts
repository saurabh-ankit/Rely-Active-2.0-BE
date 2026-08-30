import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { PropertyUnit, Resident, ResidentFamilyMember } from '../../models/index.js'
import { OwnershipType, ResidentStatus, ResidentType } from '../../enums/resident.enum.js'
import { OccupancyStatus } from '../../enums/propertyUnit.enum.js'

export async function createResident(req: Request, res: Response): Promise<void> {
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
      username,
      password,
      email,
      phone,
      emergencyContact,
      bloodGroup,
      photoUrl,
      moveInDate,
      familyMembers,
    } = req.body

    if (!unitId || !locId || !firstName || !residentType) {
      res.status(400).json({
        success: false,
        message: 'unitId, locId, firstName, and residentType are required.',
      })
      return
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

    // 4. Create Resident Record
    const resident = await Resident.create({
      unitId,
      locId,
      companyId: companyId || null,
      residentType: type,
      ownershipType: (ownershipType as OwnershipType) || OwnershipType.PRIMARY,
      isResiding: residingFlag,
      firstName: firstName.trim(),
      lastName: lastName ? lastName.trim() : null,
      username: username ? username.trim() : null,
      passwordHash: hashedPassword,
      email: email ? email.trim() : null,
      phone: phone ? phone.trim() : null,
      emergencyContact: emergencyContact || null,
      bloodGroup: bloodGroup || null,
      photoUrl: photoUrl || null,
      moveInDate: moveInDate || null,
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

          const fmResiding = residingFlag ? (fm.isResiding !== undefined ? Boolean(fm.isResiding) : true) : false

          return {
            residentId: resident.id,
            firstName: fm.firstName.trim(),
            lastName: fm.lastName ? fm.lastName.trim() : null,
            relation: fm.relation ? fm.relation.trim() : 'Family',
            isResiding: fmResiding,
            gender: fm.gender || null,
            dob: fm.dob || null,
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

    // 6. Update PropertyUnit Occupancy Status
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
    const { locId, unitId, residentType, isResiding } = req.query

    const whereClause: Record<string, unknown> = { isDeleted: false }
    if (locId) whereClause.locId = locId
    if (unitId) whereClause.unitId = unitId
    if (residentType) whereClause.residentType = residentType
    if (isResiding !== undefined) whereClause.isResiding = isResiding === 'true'

    const residents = await Resident.findAll({
      where: whereClause,
      include: [
        { model: PropertyUnit, as: 'unit' },
        { model: ResidentFamilyMember, as: 'familyMembers', where: { isDeleted: false }, required: false },
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
      email,
      phone,
      emergencyContact,
      bloodGroup,
      moveOutDate,
      status,
      isResiding,
      familyMembers,
    } = req.body

    const userPayload = (req as Request & { user?: { id?: string; username?: string } }).user
    const operatorId = userPayload?.id || userPayload?.username || 'system'
    const updatedResiding = isResiding !== undefined ? Boolean(isResiding) : resident.isResiding

    await resident.update({
      firstName: firstName ? firstName.trim() : resident.firstName,
      lastName: lastName !== undefined ? lastName : resident.lastName,
      email: email !== undefined ? email : resident.email,
      phone: phone !== undefined ? phone : resident.phone,
      emergencyContact: emergencyContact !== undefined ? emergencyContact : resident.emergencyContact,
      bloodGroup: bloodGroup !== undefined ? bloodGroup : resident.bloodGroup,
      moveOutDate: moveOutDate !== undefined ? moveOutDate : resident.moveOutDate,
      status: status || resident.status,
      isResiding: updatedResiding,
      updatedBy: operatorId,
    })

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

            const fmResiding = updatedResiding ? (fm.isResiding !== undefined ? Boolean(fm.isResiding) : true) : false

            return {
              residentId: resident.id,
              firstName: fm.firstName.trim(),
              lastName: fm.lastName ? fm.lastName.trim() : null,
              relation: fm.relation ? fm.relation.trim() : 'Family',
              isResiding: fmResiding,
              gender: fm.gender || null,
              dob: fm.dob || null,
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
