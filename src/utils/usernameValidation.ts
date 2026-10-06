import { Op } from 'sequelize'
import { User, Resident, ResidentFamilyMember } from '../models/index.js'

interface ExcludeOptions {
  excludeUserId?: string | null
  excludeResidentId?: string | null
  excludeFamilyMemberId?: string | null
}

/**
 * Checks whether a given username already exists in Users (employees/admin),
 * Primary Residents, or Resident Family Members.
 * Returns the conflicting username if taken, or null if available.
 */
export async function checkUsernameAvailability(
  rawUsername: string | null | undefined,
  options: ExcludeOptions = {},
): Promise<string | null> {
  if (!rawUsername) return null
  const username = String(rawUsername).trim()
  if (!username) return null

  // 1. Check User table (Employees / Admin)
  const userWhere: Record<string, unknown> = { username }
  if (options.excludeUserId) {
    userWhere.id = { [Op.ne]: options.excludeUserId }
  }
  const existingUser = await User.findOne({ where: userWhere })
  if (existingUser) return username

  // 2. Check Resident table (Primary Residents)
  const residentWhere: Record<string, unknown> = { username, isDeleted: false }
  if (options.excludeResidentId) {
    residentWhere.id = { [Op.ne]: options.excludeResidentId }
  }
  const existingResident = await Resident.findOne({ where: residentWhere })
  if (existingResident) return username

  // 3. Check ResidentFamilyMember table
  const fmWhere: Record<string, unknown> = { username, isDeleted: false }
  if (options.excludeFamilyMemberId) {
    fmWhere.id = { [Op.ne]: options.excludeFamilyMemberId }
  }
  const existingFm = await ResidentFamilyMember.findOne({ where: fmWhere })
  if (existingFm) return username

  return null
}
