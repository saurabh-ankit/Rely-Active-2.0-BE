import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { PropertyUnit, Resident, ResidentFamilyMember } from '../../models/index.js'
import { generateToken } from '../../utils/jwt.js'

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
      include: [{ model: PropertyUnit, as: 'unit' }],
    })

    if (!resident || !resident.passwordHash) {
      // 2. Try finding in resident_family_members table
      const familyMember = await ResidentFamilyMember.findOne({
        where: { username: trimmedUsername, isDeleted: false },
        include: [{ model: Resident, as: 'resident', include: [{ model: PropertyUnit, as: 'unit' }] }],
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
          username: resident.username,
          email: resident.email,
          phone: resident.phone,
          unit: resident.unit,
        },
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error during resident login'
    res.status(500).json({
      success: false,
      message,
    })
  }
}
