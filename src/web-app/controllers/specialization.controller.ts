import type { Response } from 'express'
import { Op, type WhereOptions } from 'sequelize'
import {
  DoctorSpecialization,
  JobCategory,
  Role,
  Specialization,
  User,
  UserDetail,
  UserLocation,
} from '../../models/index.js'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { HttpError } from '../../middlewares/error/http-error.js'
import {
  assertUserIsDoctor,
  getDoctorSpecializations as loadDoctorSpecializations,
  syncDoctorSpecializations,
} from '../../services/doctorSpecialization.service.js'
import {
  normalizeSpecializationCode,
  type CreateSpecializationInput,
  type SetDoctorSpecializationsInput,
  type UpdateSpecializationInput,
} from '../../validations/specialization.validation.js'

function sendError(res: Response, err: unknown, logLabel: string): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      success: false,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    })
    return
  }
  console.error(logLabel, err)
  res.status(500).json({ success: false, message: err instanceof Error ? err.message : 'Unknown error' })
}

function formatSpecialization(specialization: Specialization, doctorCount?: number): Record<string, unknown> {
  return {
    id: specialization.id,
    name: specialization.name,
    code: specialization.code,
    description: specialization.description,
    isActive: specialization.isActive,
    createdAt: specialization.createdAt,
    updatedAt: specialization.updatedAt,
    ...(doctorCount === undefined ? {} : { doctorCount }),
  }
}

/** Number of active doctors currently holding each specialization. */
async function getDoctorCounts(specializationIds: string[]): Promise<Record<string, number>> {
  if (specializationIds.length === 0) return {}
  const rows = (await DoctorSpecialization.findAll({
    attributes: [
      'specializationId',
      [DoctorSpecialization.sequelize!.fn('COUNT', DoctorSpecialization.sequelize!.col('userId')), 'count'],
    ],
    where: { specializationId: { [Op.in]: specializationIds }, isActive: true, isDeleted: false },
    group: ['specializationId'],
    raw: true,
  })) as unknown as Array<{ specializationId: string; count: number | string }>

  return Object.fromEntries(rows.map((row) => [row.specializationId, Number(row.count)]))
}

async function findVisibleSpecialization(req: AuthenticatedRequest, id: string): Promise<Specialization> {
  const specialization = await Specialization.findOne({ where: { id, isDeleted: false } })
  if (!specialization) {
    throw new HttpError(404, 'Specialization not found')
  }
  return specialization
}

/** Specialization codes are unique across the catalog. */
async function assertCodeIsFree(code: string, excludeId?: string): Promise<void> {
  const clash = await Specialization.findOne({
    where: {
      code,
      ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
    },
  })
  if (clash) {
    // The unique index covers deleted rows too, so report the real reason.
    throw new HttpError(
      409,
      clash.isDeleted
        ? `A deleted specialization already uses code "${code}". Create it with a different code.`
        : `A specialization with code "${code}" already exists`,
    )
  }
}

/**
 * GET /api/v1/specializations
 * Query: search, isActive (true|false), includeDoctorCount (true|false)
 */
export async function getAllSpecializations(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { search, isActive, includeDoctorCount } = req.query as Record<string, string | undefined>

    const filters: WhereOptions[] = [{ isDeleted: false }]
    if (isActive === 'true' || isActive === 'false') {
      filters.push({ isActive: isActive === 'true' })
    }
    if (search && search.trim()) {
      const q = `%${search.trim()}%`
      filters.push({ [Op.or]: [{ name: { [Op.like]: q } }, { code: { [Op.like]: q } }] })
    }

    const specializations = await Specialization.findAll({
      where: { [Op.and]: filters },
      order: [['name', 'ASC']],
    })

    const counts = includeDoctorCount === 'true' ? await getDoctorCounts(specializations.map((s) => s.id)) : null

    res.status(200).json({
      success: true,
      data: specializations.map((s) => formatSpecialization(s, counts ? counts[s.id] || 0 : undefined)),
    })
  } catch (err: unknown) {
    sendError(res, err, 'Error fetching specializations:')
  }
}

/** GET /api/v1/specializations/:id */
export async function getSpecializationById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const specialization = await findVisibleSpecialization(req, req.params.id as string)
    const counts = await getDoctorCounts([specialization.id])

    res.status(200).json({
      success: true,
      data: formatSpecialization(specialization, counts[specialization.id] || 0),
    })
  } catch (err: unknown) {
    sendError(res, err, 'Error fetching specialization:')
  }
}

/** POST /api/v1/specializations */
export async function createSpecialization(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { name, code, description, isActive } = req.body as CreateSpecializationInput

    const finalCode = code || normalizeSpecializationCode(name)

    // Deleted rows keep their code (the unique index covers them), so creating the
    // same code again restores that row instead of failing.
    const deleted = await Specialization.findOne({ where: { code: finalCode, isDeleted: true } })
    let specialization: Specialization
    if (deleted) {
      deleted.name = name
      deleted.description = description ?? null
      deleted.isActive = isActive ?? true
      deleted.isDeleted = false
      deleted.updatedBy = req.user?.id || null
      await deleted.save()
      specialization = deleted
    } else {
      await assertCodeIsFree(finalCode)
      specialization = await Specialization.create({
        name,
        code: finalCode,
        description: description ?? null,
        isActive: isActive ?? true,
        createdBy: req.user?.id || null,
      })
    }

    res.status(201).json({
      success: true,
      message: 'Specialization created successfully',
      data: formatSpecialization(specialization, 0),
    })
  } catch (err: unknown) {
    sendError(res, err, 'Error creating specialization:')
  }
}

/** PUT /api/v1/specializations/:id */
export async function updateSpecialization(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const specialization = await findVisibleSpecialization(req, req.params.id as string)
    const { name, code, description, isActive } = req.body as UpdateSpecializationInput

    if (code && code !== specialization.code) {
      await assertCodeIsFree(code, specialization.id)
      specialization.code = code
    }
    if (name !== undefined) specialization.name = name
    if (description !== undefined) specialization.description = description ?? null
    if (isActive !== undefined) specialization.isActive = isActive
    specialization.updatedBy = req.user?.id || null
    await specialization.save()

    const counts = await getDoctorCounts([specialization.id])

    res.status(200).json({
      success: true,
      message: 'Specialization updated successfully',
      data: formatSpecialization(specialization, counts[specialization.id] || 0),
    })
  } catch (err: unknown) {
    sendError(res, err, 'Error updating specialization:')
  }
}

/**
 * PATCH /api/v1/specializations/:id/status
 * Deactivating is allowed; the response reports how many doctors are affected.
 */
export async function updateSpecializationStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const specialization = await findVisibleSpecialization(req, req.params.id as string)
    const { isActive } = req.body as { isActive: boolean }

    specialization.isActive = isActive
    specialization.updatedBy = req.user?.id || null
    await specialization.save()

    const counts = await getDoctorCounts([specialization.id])
    const doctorCount = counts[specialization.id] || 0

    res.status(200).json({
      success: true,
      message: isActive
        ? 'Specialization activated successfully'
        : `Specialization deactivated${doctorCount ? `. ${doctorCount} doctor(s) still hold it` : ''}`,
      data: formatSpecialization(specialization, doctorCount),
    })
  } catch (err: unknown) {
    sendError(res, err, 'Error updating specialization status:')
  }
}

/**
 * DELETE /api/v1/specializations/:id
 * Soft delete, refused while doctors still hold the specialization.
 */
export async function deleteSpecialization(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const specialization = await findVisibleSpecialization(req, req.params.id as string)

    const counts = await getDoctorCounts([specialization.id])
    const doctorCount = counts[specialization.id] || 0
    if (doctorCount > 0) {
      throw new HttpError(
        409,
        `Cannot delete: ${doctorCount} doctor(s) hold this specialization. Remove it from them or deactivate it instead.`,
        { doctorCount },
      )
    }

    specialization.isDeleted = true
    specialization.isActive = false
    specialization.updatedBy = req.user?.id || null
    await specialization.save()

    res.status(200).json({ success: true, message: 'Specialization deleted successfully' })
  } catch (err: unknown) {
    sendError(res, err, 'Error deleting specialization:')
  }
}

// ── Doctor ↔ specialization ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatDoctor(user: any, specializations: Specialization[], primaryId: string | null) {
  const profile = user.profile
  const name = `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim() || user.username
  const primaryLocation = user.userLocations?.[0]

  return {
    id: user.id,
    name,
    username: user.username,
    email: user.email,
    phone: user.phone,
    photoUrl: profile?.photoUrl || null,
    role: primaryLocation?.role?.name || null,
    jobCategory: primaryLocation?.jobCategory?.name || null,
    specializations: specializations.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      isPrimary: s.id === primaryId,
    })),
  }
}

/** GET /api/v1/specializations/doctors/:userId */
export async function getDoctorSpecializations(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.params.userId as string
    await assertUserIsDoctor(userId)

    res.status(200).json({ success: true, data: await loadDoctorSpecializations(userId) })
  } catch (err: unknown) {
    sendError(res, err, 'Error fetching doctor specializations:')
  }
}

/**
 * PUT /api/v1/specializations/doctors/:userId
 * Replaces the doctor's specializations with the given list.
 */
export async function setDoctorSpecializations(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.params.userId as string
    const { specializationIds, primarySpecializationId } = req.body as SetDoctorSpecializationsInput

    await assertUserIsDoctor(userId)

    const data = await syncDoctorSpecializations({
      userId,
      specializationIds,
      primarySpecializationId: primarySpecializationId ?? null,
      operatingUserId: req.user?.id ?? null,
    })

    res.status(200).json({
      success: true,
      message: 'Doctor specializations updated successfully',
      data,
    })
  } catch (err: unknown) {
    sendError(res, err, 'Error updating doctor specializations:')
  }
}

/**
 * GET /api/v1/specializations/:id/doctors
 * Doctors eligible for resident assignment or slot booking: active doctors who
 * hold this specialization, optionally limited to one location.
 */
export async function getDoctorsBySpecialization(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const specialization = await findVisibleSpecialization(req, req.params.id as string)
    // Only scope by location when one is explicitly asked for: falling back to the
    // caller's own location would hide doctors at other properties from a global admin.
    const locId =
      (req.query.locId as string) ||
      (req.headers['x-location-id'] as string) ||
      (req.headers['x-property-id'] as string) ||
      null

    const links = await DoctorSpecialization.findAll({
      where: { specializationId: specialization.id, isActive: true, isDeleted: false },
      attributes: ['userId', 'isPrimary'],
      raw: true,
    })
    const doctorIds = links.map((link) => link.userId)

    if (doctorIds.length === 0) {
      res.status(200).json({ success: true, data: [] })
      return
    }

    const doctors = (await User.findAll({
      where: { id: { [Op.in]: doctorIds }, isActive: true, isDeleted: false },
      include: [
        { model: UserDetail, as: 'profile' },
        {
          model: UserLocation,
          as: 'userLocations',
          where: { isActive: true, isDeleted: false, ...(locId ? { locId } : {}) },
          required: true,
          include: [
            { model: Role, as: 'role', where: { code: 'DOCTOR' }, required: true },
            { model: JobCategory, as: 'jobCategory', required: false },
          ],
        },
      ],
      order: [['username', 'ASC']],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any[]

    res.status(200).json({
      success: true,
      data: doctors.map((doctor) => formatDoctor(doctor, [specialization], specialization.id)),
    })
  } catch (err: unknown) {
    sendError(res, err, 'Error fetching doctors by specialization:')
  }
}
