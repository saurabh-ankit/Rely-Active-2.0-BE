import { Op } from 'sequelize'
import {
  SchedulingResource,
  UserLocation,
  User,
  UserDetail,
  Property,
  Role,
  RosterDoctorProfile,
  RosterDoctorLocation,
  Department,
} from '../../../models/index.js'

type ResourceType = 'EMPLOYEE' | 'DOCTOR'

export class SchedulingResourceService {
  /**
   * Resolve active user_locations for a company/location.
   * Includes legacy rows where companyId was not set on user_locations (matched by property).
   */
  private static async getActiveUserLocationsForLocation(
    companyId: string,
    locationId: string,
    options?: { departmentId?: string; performedBy?: string },
  ): Promise<Array<UserLocation & { role?: Role | null; department?: Department | null }>> {
    const property = await Property.findOne({
      where: { id: locationId, companyId, isDeleted: false },
    })
    if (!property) return []

    const where: Record<string, unknown> = {
      locId: locationId,
      isActive: true,
      isDeleted: false,
      [Op.or]: [{ companyId }, { companyId: null }],
    }
    if (options?.departmentId) where.departmentId = options.departmentId

    const userLocations = (await UserLocation.findAll({
      where,
      include: [
        { model: User, as: 'user', where: { isDeleted: false }, required: true },
        { model: Role, as: 'role', required: false },
        { model: Department, as: 'department', required: false },
      ],
    })) as Array<UserLocation & { role?: Role | null; department?: Department | null }>

    if (options?.performedBy) {
      for (const ul of userLocations) {
        if (!ul.companyId) {
          await ul.update({ companyId, updatedBy: options.performedBy })
        }
      }
    }

    return userLocations
  }

  private static isDoctorRole(role?: Role | null): boolean {
    return (role?.code || '').toUpperCase() === 'DOCTOR'
  }

  /**
   * Ensure a doctor profile + location access exist for an in-house doctor synced from user_locations.
   */
  private static async ensureDoctorProfileForUser(
    userId: string,
    locationId: string,
    performedBy: string,
    specializationHint?: string | null,
  ): Promise<RosterDoctorProfile> {
    let profile = await RosterDoctorProfile.findOne({
      where: { userId, isDeleted: false },
    })

    if (!profile) {
      profile = await RosterDoctorProfile.create({
        userId,
        doctorType: 'IN_HOUSE',
        specialization: specializationHint?.trim() || 'General Medicine',
        medicalLicenseNumber: `PENDING-${userId.slice(0, 8).toUpperCase()}`,
        maxPatientsPerSlot: 15,
        defaultSlotDurationMinutes: 30,
        createdBy: performedBy,
        updatedBy: performedBy,
      })
    }

    const today = new Date().toISOString().split('T')[0] || '2026-01-01'
    const locationAccess = await RosterDoctorLocation.findOne({
      where: { doctorProfileId: profile.id, locationId, isDeleted: false },
    })
    if (!locationAccess) {
      await RosterDoctorLocation.create({
        doctorProfileId: profile.id,
        locationId,
        validFrom: today,
        status: 'ACTIVE',
        createdBy: performedBy,
        updatedBy: performedBy,
      })
    } else if (locationAccess.status !== 'ACTIVE') {
      await locationAccess.update({ status: 'ACTIVE', updatedBy: performedBy })
    }

    return profile
  }

  /**
   * Upsert a scheduling resource for a user at the given resource type.
   * Converts EMPLOYEE <-> DOCTOR when the user's role changes.
   */
  private static async upsertResourceForUser(options: {
    companyId: string
    locationId: string
    userId: string
    departmentId: string | null
    resourceType: ResourceType
    performedBy: string
    specializationHint?: string | null
  }): Promise<'created' | 'updated' | 'unchanged'> {
    const { companyId, locationId, userId, departmentId, resourceType, performedBy, specializationHint } = options
    const today = new Date().toISOString().split('T')[0] || '2026-01-01'

    let doctorProfileId: string | null = null
    if (resourceType === 'DOCTOR') {
      const profile = await SchedulingResourceService.ensureDoctorProfileForUser(
        userId,
        locationId,
        performedBy,
        specializationHint,
      )
      doctorProfileId = profile.id
    }

    const existing = await SchedulingResource.findOne({
      where: { companyId, userId, isDeleted: false },
    })

    if (existing) {
      const needsUpdate =
        existing.resourceType !== resourceType ||
        existing.departmentId !== departmentId ||
        existing.status !== 'ACTIVE' ||
        (resourceType === 'DOCTOR' && existing.doctorProfileId !== doctorProfileId)

      if (!needsUpdate) return 'unchanged'

      await existing.update({
        resourceType,
        departmentId,
        doctorProfileId: resourceType === 'DOCTOR' ? doctorProfileId : null,
        status: 'ACTIVE',
        updatedBy: performedBy,
      })
      return 'updated'
    }

    await SchedulingResource.create({
      companyId,
      resourceType,
      userId,
      departmentId,
      doctorProfileId,
      status: 'ACTIVE',
      effectiveFrom: today,
      createdBy: performedBy,
      updatedBy: performedBy,
    })
    return 'created'
  }

  /**
   * Sync scheduling resources from active user_locations for a company/location.
   * Users with role DOCTOR become DOCTOR resources; everyone else becomes EMPLOYEE.
   */
  public static async syncEmployeeResources(
    companyId: string,
    locationId: string,
    performedBy: string,
  ): Promise<{ created: number; updated: number }> {
    const userLocations = await SchedulingResourceService.getActiveUserLocationsForLocation(companyId, locationId, {
      performedBy,
    })

    let created = 0
    let updated = 0

    for (const ul of userLocations) {
      const resourceType: ResourceType = SchedulingResourceService.isDoctorRole(ul.role) ? 'DOCTOR' : 'EMPLOYEE'
      const result = await SchedulingResourceService.upsertResourceForUser({
        companyId,
        locationId,
        userId: ul.userId,
        departmentId: ul.departmentId,
        resourceType,
        performedBy,
        specializationHint: ul.department?.name || null,
      })
      if (result === 'created') created++
      if (result === 'updated') updated++
    }

    return { created, updated }
  }

  public static async listResources(
    companyId: string,
    filters: {
      locationId?: string
      departmentId?: string
      resourceType?: 'EMPLOYEE' | 'DOCTOR'
    },
  ) {
    const where: Record<string, unknown> = { companyId, isDeleted: false, status: 'ACTIVE' }
    if (filters.departmentId) where.departmentId = filters.departmentId
    if (filters.resourceType) where.resourceType = filters.resourceType

    const resources = await SchedulingResource.findAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          required: false,
          include: [{ model: UserDetail, as: 'profile', required: false }],
        },
      ],
      order: [['createdAt', 'ASC']],
    })

    if (filters.locationId && (filters.resourceType === 'EMPLOYEE' || filters.resourceType === 'DOCTOR')) {
      const locationUserIds = (
        await SchedulingResourceService.getActiveUserLocationsForLocation(companyId, filters.locationId, {
          departmentId: filters.departmentId,
        })
      ).map((ul) => ul.userId)

      // Doctors may also be scoped via roster_doctor_locations (visiting / onboarded)
      let doctorLocationUserIds: string[] = []
      if (filters.resourceType === 'DOCTOR') {
        const doctorLocations = await RosterDoctorLocation.findAll({
          where: { locationId: filters.locationId, status: 'ACTIVE', isDeleted: false },
          include: [
            {
              model: RosterDoctorProfile,
              as: 'doctorProfile',
              required: true,
              where: { isDeleted: false, isActive: true },
              attributes: ['userId'],
            },
          ],
        })
        doctorLocationUserIds = doctorLocations
          .map((dl) => (dl as RosterDoctorLocation & { doctorProfile?: RosterDoctorProfile }).doctorProfile?.userId)
          .filter((id): id is string => Boolean(id))
      }

      const allowedUserIds = new Set([...locationUserIds, ...doctorLocationUserIds])
      return resources.filter((r) => r.userId && allowedUserIds.has(r.userId))
    }

    return resources
  }

  public static async resolveSchedulingResourceId(
    companyId: string,
    rawResourceId: string,
    locationId?: string,
  ): Promise<string> {
    const resource = await SchedulingResource.findOne({
      where: { id: rawResourceId, companyId, isDeleted: false },
    })
    if (resource) return resource.id

    const userResource = await SchedulingResource.findOne({
      where: { userId: rawResourceId, companyId, isDeleted: false },
    })
    if (userResource) return userResource.id

    const user = await User.findByPk(rawResourceId)
    if (!user) {
      throw new Error('Scheduling resource or user not found.')
    }

    if (locationId) {
      await SchedulingResourceService.syncEmployeeResources(companyId, locationId, 'system')
    }

    const synced = await SchedulingResource.findOne({
      where: { companyId, userId: user.id, isDeleted: false },
    })
    if (synced) return synced.id

    throw new Error(
      `No scheduling resource found for user ${rawResourceId}. Run resource sync or onboard doctor first.`,
    )
  }
}
