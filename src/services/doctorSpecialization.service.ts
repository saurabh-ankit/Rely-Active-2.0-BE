import { Op, type Transaction } from 'sequelize'
import { DoctorSpecialization, Role, Specialization, User, UserLocation } from '../models/index.js'
import { HttpError } from '../middlewares/error/http-error.js'

/**
 * Shared doctor ↔ specialization logic, used by the specializations API and by
 * user create/update so a doctor's specializations can be set in one request.
 */

export interface DoctorSpecializationSummary {
  id: string
  name: string
  code: string
  description: string | null
  isPrimary: boolean
}

export async function isDoctor(userId: string): Promise<boolean> {
  const locations = (await UserLocation.findAll({
    where: { userId, isDeleted: false },
    include: [{ model: Role, as: 'role' }],
  })) as Array<UserLocation & { role?: Role }>
  return locations.some((ul) => (ul.role?.code || '').toUpperCase() === 'DOCTOR')
}

export async function assertUserIsDoctor(userId: string): Promise<User> {
  const user = await User.findByPk(userId)
  if (!user || user.isDeleted) {
    throw new HttpError(404, 'User not found')
  }
  if (!(await isDoctor(userId))) {
    throw new HttpError(400, 'Specializations can only be assigned to users with the Doctor role')
  }
  return user
}

export async function getDoctorSpecializations(userId: string): Promise<DoctorSpecializationSummary[]> {
  const links = (await DoctorSpecialization.findAll({
    where: { userId, isActive: true, isDeleted: false },
    include: [{ model: Specialization, as: 'specialization' }],
    order: [['isPrimary', 'DESC']],
  })) as Array<DoctorSpecialization & { specialization?: Specialization }>

  return links
    .filter((link) => link.specialization && !link.specialization.isDeleted)
    .map((link) => ({
      id: link.specialization!.id,
      name: link.specialization!.name,
      code: link.specialization!.code,
      description: link.specialization!.description,
      isPrimary: link.isPrimary,
    }))
}

/** Same as `getDoctorSpecializations` for many users at once, keyed by user id. */
export async function getSpecializationsForUsers(
  userIds: string[],
): Promise<Record<string, DoctorSpecializationSummary[]>> {
  if (userIds.length === 0) return {}

  const links = (await DoctorSpecialization.findAll({
    where: { userId: { [Op.in]: userIds }, isActive: true, isDeleted: false },
    include: [{ model: Specialization, as: 'specialization' }],
    order: [['isPrimary', 'DESC']],
  })) as Array<DoctorSpecialization & { specialization?: Specialization }>

  const byUser: Record<string, DoctorSpecializationSummary[]> = {}
  for (const link of links) {
    if (!link.specialization || link.specialization.isDeleted) continue
    byUser[link.userId] = byUser[link.userId] || []
    byUser[link.userId]!.push({
      id: link.specialization.id,
      name: link.specialization.name,
      code: link.specialization.code,
      description: link.specialization.description,
      isPrimary: link.isPrimary,
    })
  }
  return byUser
}

/**
 * Replaces a doctor's specializations with `specializationIds`.
 * Rows for removed specializations are kept but deactivated, so the unique
 * (userId, specializationId) key and the history stay intact.
 */
export async function syncDoctorSpecializations(options: {
  userId: string
  specializationIds: string[]
  primarySpecializationId?: string | null
  operatingUserId?: string | null
  transaction?: Transaction
}): Promise<DoctorSpecializationSummary[]> {
  const { userId, primarySpecializationId, operatingUserId, transaction } = options
  // `exactOptionalPropertyTypes` rejects an explicit `transaction: undefined`.
  const tx = transaction ? { transaction } : {}
  const uniqueIds = [...new Set(options.specializationIds)]

  if (uniqueIds.length === 0) {
    await DoctorSpecialization.update(
      { isActive: false, isDeleted: true, updatedBy: operatingUserId || null },
      { where: { userId }, ...tx },
    )
    return []
  }

  const specializations = await Specialization.findAll({
    where: { id: { [Op.in]: uniqueIds }, isDeleted: false },
    ...tx,
  })

  const foundIds = new Set(specializations.map((s) => s.id))
  const missing = uniqueIds.filter((id) => !foundIds.has(id))
  if (missing.length > 0) {
    throw new HttpError(400, 'Some specializations do not exist or are not available', { missing })
  }
  const inactive = specializations.filter((s) => !s.isActive).map((s) => s.name)
  if (inactive.length > 0) {
    throw new HttpError(400, `Inactive specializations cannot be assigned: ${inactive.join(', ')}`)
  }
  if (primarySpecializationId && !foundIds.has(primarySpecializationId)) {
    throw new HttpError(400, 'The primary specialization must be one of the selected specializations')
  }

  const primaryId = primarySpecializationId || uniqueIds[0] || null

  await DoctorSpecialization.update(
    { isActive: false, isDeleted: true, updatedBy: operatingUserId || null },
    { where: { userId, specializationId: { [Op.notIn]: uniqueIds } }, ...tx },
  )

  for (const specializationId of uniqueIds) {
    const existing = await DoctorSpecialization.findOne({ where: { userId, specializationId }, ...tx })
    if (existing) {
      existing.isActive = true
      existing.isDeleted = false
      existing.isPrimary = specializationId === primaryId
      existing.updatedBy = operatingUserId || null
      await existing.save({ ...tx })
    } else {
      await DoctorSpecialization.create(
        {
          userId,
          specializationId,
          isPrimary: specializationId === primaryId,
          createdBy: operatingUserId || null,
        },
        { ...tx },
      )
    }
  }

  return specializations.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    description: s.description,
    isPrimary: s.id === primaryId,
  }))
}

/** Reads `specializationIds` / `primarySpecializationId` off a user request body. */
export function readSpecializationInput(body: Record<string, unknown>): {
  specializationIds?: string[]
  primarySpecializationId?: string | undefined
} {
  const raw = body.specializationIds ?? body.specialization_ids
  if (raw === undefined || raw === null || raw === '') return {}

  let ids: unknown = raw
  if (typeof raw === 'string') {
    // Multipart form data sends this as JSON or a comma separated list.
    try {
      ids = JSON.parse(raw)
    } catch {
      ids = raw.split(',')
    }
  }
  if (!Array.isArray(ids)) {
    throw new HttpError(400, 'specializationIds must be an array of specialization IDs')
  }

  const cleaned = ids.map((id) => (typeof id === 'string' ? id.trim() : '')).filter((id): id is string => id.length > 0)

  const primary = body.primarySpecializationId ?? body.primary_specialization_id
  return {
    specializationIds: cleaned,
    primarySpecializationId: typeof primary === 'string' && primary.trim() ? primary.trim() : undefined,
  }
}
