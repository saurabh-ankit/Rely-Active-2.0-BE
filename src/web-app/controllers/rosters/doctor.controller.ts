import type { Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import {
  RosterDoctorProfile,
  SchedulingResource,
  RosterDoctorLocation,
  RosterDoctorEngagement,
  User,
} from '../../../models/index.js'

/**
 * Onboard a Doctor (In-House or Visiting)
 * POST /api/v1/roster/companies/:companyId/locations/:locationId/doctors/onboard
 */
export async function onboardDoctor(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const companyId = req.params.companyId as string
    const locationId = req.params.locationId as string
    const {
      userId,
      doctorType,
      specialization,
      medicalLicenseNumber,
      licenseExpiryDate,
      consultationFee,
      maxPatientsPerSlot,
      defaultSlotDurationMinutes,
    } = req.body

    const userIdToUse = (userId as string) || req.user?.id
    if (!userIdToUse) {
      return res.status(400).json({ success: false, message: 'User ID is required for doctor onboarding.' })
    }

    // 1. Create Roster Doctor Profile
    const doctorProfile = await RosterDoctorProfile.create({
      userId: userIdToUse,
      doctorType: doctorType || 'IN_HOUSE',
      specialization,
      medicalLicenseNumber,
      licenseExpiryDate: licenseExpiryDate || null,
      consultationFee: consultationFee || null,
      maxPatientsPerSlot: maxPatientsPerSlot || 15,
      defaultSlotDurationMinutes: defaultSlotDurationMinutes || 30,
      createdBy: req.user?.id || 'system',
      updatedBy: req.user?.id || 'system',
    })

    // 2. Create Schedulable Resource Abstraction
    const schedulingResource = await SchedulingResource.create({
      companyId,
      resourceType: 'DOCTOR',
      userId: userIdToUse,
      doctorProfileId: doctorProfile.id,
      status: 'ACTIVE',
      effectiveFrom: new Date().toISOString().split('T')[0] || '2026-08-31',
      createdBy: req.user?.id || 'system',
      updatedBy: req.user?.id || 'system',
    })

    // 3. Grant Initial Location Scope
    const locationAccess = await RosterDoctorLocation.create({
      doctorProfileId: doctorProfile.id,
      locationId,
      validFrom: new Date().toISOString().split('T')[0] || '2026-08-31',
      status: 'ACTIVE',
      createdBy: req.user?.id || 'system',
      updatedBy: req.user?.id || 'system',
    })

    return res.status(201).json({
      success: true,
      message: 'Doctor successfully onboarded and resource created.',
      data: {
        doctorProfile,
        schedulingResource,
        locationAccess,
      },
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Add Location Scope to Doctor Profile
 * POST /api/v1/roster/doctors/:doctorProfileId/locations
 */
export async function addDoctorLocationScope(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const doctorProfileId = req.params.doctorProfileId as string
    const { locationId, validFrom, validUntil } = req.body

    const locationAccess = await RosterDoctorLocation.create({
      doctorProfileId,
      locationId: locationId as string,
      validFrom: validFrom || new Date().toISOString().split('T')[0],
      validUntil: validUntil || null,
      status: 'ACTIVE',
      createdBy: req.user?.id || 'system',
      updatedBy: req.user?.id || 'system',
    })

    return res.status(201).json({
      success: true,
      message: 'Doctor location authorization scope updated.',
      data: locationAccess,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Create Visiting Doctor Engagement Contract
 * POST /api/v1/roster/doctors/:doctorProfileId/engagements
 */
export async function createDoctorEngagement(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const doctorProfileId = req.params.doctorProfileId as string
    const { companyId, locationId, validFrom, validUntil, serviceCategory, clinicRoomId, defaultSlotCapacity } =
      req.body

    const engagement = await RosterDoctorEngagement.create({
      doctorProfileId,
      companyId: companyId as string,
      locationId: locationId as string,
      validFrom: validFrom as string,
      validUntil: validUntil as string,
      serviceCategory: serviceCategory as string,
      clinicRoomId: clinicRoomId || null,
      defaultSlotCapacity: defaultSlotCapacity || 15,
      status: 'ACTIVE',
      createdBy: req.user?.id || 'system',
      updatedBy: req.user?.id || 'system',
    })

    return res.status(201).json({
      success: true,
      message: 'Visiting Doctor engagement contract established.',
      data: engagement,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * List Doctors for Location
 * GET /api/v1/roster/companies/:companyId/locations/:locationId/doctors
 */
export async function getDoctorsForLocation(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const locationId = req.params.locationId as string

    const locationScopes = await RosterDoctorLocation.findAll({
      where: { locationId, status: 'ACTIVE', isDeleted: false },
      include: [
        {
          model: RosterDoctorProfile,
          as: 'doctorProfile',
          include: [{ model: User, as: 'user' }],
        },
      ],
    })

    return res.status(200).json({
      success: true,
      data: locationScopes,
    })
  } catch (error) {
    next(error)
  }
}
