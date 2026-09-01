import { Op } from 'sequelize'
import {
  SchedulingResource,
  RosterDoctorProfile,
  RosterDoctorLocation,
  RosterDoctorEngagement,
  RosterAssignmentDate,
  RosterSetting,
} from '../../../models/index.js'

export type ValidationErrorSeverity = 'BLOCK' | 'WARNING' | 'INFO'

export interface ValidationErrorItem {
  code: string
  severity: ValidationErrorSeverity
  date?: string
  message: string
}

export interface ValidationEngineResult {
  valid: boolean
  requiresOverride: boolean
  errors: ValidationErrorItem[]
  warnings: ValidationErrorItem[]
}

export interface ValidateAssignmentPayload {
  companyId: string
  locationId: string
  schedulingResourceId: string
  effectiveFrom: string
  effectiveUntil: string
  proposedDates: Array<{
    assignmentDate: string
    scheduledStart: Date
    scheduledEnd: Date
    slotTimeRange: string
  }>
  overrideReason?: string | undefined
}


export class RosterValidationEngine {
  /**
   * Validates a proposed roster assignment against all 3-level hard blocking rules and soft warnings.
   */
  public static async validate(payload: ValidateAssignmentPayload): Promise<ValidationEngineResult> {
    const errors: ValidationErrorItem[] = []
    const warnings: ValidationErrorItem[] = []

    // ── LEVEL 1: RESOURCE & AUTHORIZATION CHECKS ──────────────────────────────
    const resource = await SchedulingResource.findOne({
      where: {
        id: payload.schedulingResourceId,
        companyId: payload.companyId,
        isDeleted: false,
      },
      include: [{ model: RosterDoctorProfile, as: 'doctorProfile' }],
    })

    if (!resource) {
      errors.push({
        code: 'RESOURCE_NOT_FOUND',
        severity: 'BLOCK',
        message: 'Schedulable resource does not exist or has been deleted.',
      })
      return { valid: false, requiresOverride: false, errors, warnings }
    }

    if (resource.status !== 'ACTIVE') {
      errors.push({
        code: 'RESOURCE_INACTIVE',
        severity: 'BLOCK',
        message: 'The selected schedulable resource is currently inactive.',
      })
    }

    // Doctor Specific Authorization & Engagement Scope Checks
    if (resource.resourceType === 'DOCTOR' && resource.doctorProfile) {
      const doctor = resource.doctorProfile

      // Location Authorization Scope Check
      const locationAccess = await RosterDoctorLocation.findOne({
        where: {
          doctorProfileId: doctor.id,
          locationId: payload.locationId,
          status: 'ACTIVE',
          isDeleted: false,
          validFrom: { [Op.lte]: payload.effectiveFrom },
          [Op.or]: [{ validUntil: null }, { validUntil: { [Op.gte]: payload.effectiveUntil } }],
        },
      })

      if (!locationAccess) {
        errors.push({
          code: 'LOCATION_UNAUTHORIZED',
          severity: 'BLOCK',
          message: 'Doctor is not authorized for active duty at this property location during the assignment window.',
        })
      }

      // Visiting Doctor Engagement Validity Check
      if (doctor.doctorType === 'VISITING') {
        const activeEngagement = await RosterDoctorEngagement.findOne({
          where: {
            doctorProfileId: doctor.id,
            locationId: payload.locationId,
            status: 'ACTIVE',
            isDeleted: false,
            validFrom: { [Op.lte]: payload.effectiveFrom },
            validUntil: { [Op.gte]: payload.effectiveUntil },
          },
        })

        if (!activeEngagement) {
          errors.push({
            code: 'VISITING_ENGAGEMENT_INVALID',
            severity: 'BLOCK',
            message: 'Visiting Doctor has no active contractual engagement covering this location and effective window.',
          })
        }
      }
    }

    // ── LEVEL 2: LOCATION SETTINGS & POLICIES ─────────────────────────────────
    const settings = (await RosterSetting.findOne({
      where: { companyId: payload.companyId, locationId: payload.locationId, isDeleted: false },
    })) || {
      minRestPeriodHours: 11,
      maxWeeklyHours: 48,
      minMultiPropertyTravelMinutes: 60,
    }

    // Track weekly working hours for Employees
    const weeklyHoursMap: Record<string, number> = {}

    // ── LEVEL 3: PER-INSTANCE OPERATIONAL & DATE CHECKS ────────────────────────
    for (const item of payload.proposedDates) {
      const proposedStart = new Date(item.scheduledStart)
      const proposedEnd = new Date(item.scheduledEnd)
      const durationHours = (proposedEnd.getTime() - proposedStart.getTime()) / (3600 * 1000)

      // Per-Date Doctor License Expiry Check
      if (resource.resourceType === 'DOCTOR' && resource.doctorProfile?.licenseExpiryDate) {
        if (resource.doctorProfile.licenseExpiryDate < item.assignmentDate) {
          errors.push({
            code: 'LICENSE_EXPIRED_ON_DATE',
            severity: 'BLOCK',
            date: item.assignmentDate,
            message: `Medical license expires on ${resource.doctorProfile.licenseExpiryDate}, which is before scheduled date ${item.assignmentDate}.`,
          })
        }
      }

      // Query existing active assignments for exact or cross-midnight overlap
      const existingInstances = await RosterAssignmentDate.findAll({
        where: {
          schedulingResourceId: payload.schedulingResourceId,
          activeToken: 'ACTIVE',
          status: { [Op.ne]: 'CANCELLED' },
          isDeleted: false,
          [Op.or]: [
            {
              scheduledStart: { [Op.lt]: proposedEnd },
              scheduledEnd: { [Op.gt]: proposedStart },
            },
          ],
        },
      })

      if (existingInstances.length > 0) {
        errors.push({
          code: 'TIME_OVERLAP_CONFLICT',
          severity: 'BLOCK',
          date: item.assignmentDate,
          message: `Time overlap conflict on ${item.assignmentDate} (${item.slotTimeRange}) with existing duty instance.`,
        })
      }

      // Rest Period Calculation (Check 11-hour rest window)
      const bufferMs = settings.minRestPeriodHours * 3600 * 1000
      const minRestStart = new Date(proposedStart.getTime() - bufferMs)
      const minRestEnd = new Date(proposedEnd.getTime() + bufferMs)

      const adjacentInstances = await RosterAssignmentDate.findAll({
        where: {
          schedulingResourceId: payload.schedulingResourceId,
          activeToken: 'ACTIVE',
          status: { [Op.ne]: 'CANCELLED' },
          isDeleted: false,
          [Op.or]: [
            {
              scheduledEnd: {
                [Op.gt]: minRestStart,
                [Op.lte]: proposedStart,
              },
            },
            {
              scheduledStart: {
                [Op.gte]: proposedEnd,
                [Op.lt]: minRestEnd,
              },
            },
          ],
        },
      })

      if (adjacentInstances.length > 0) {
        warnings.push({
          code: 'REST_PERIOD_VIOLATION',
          severity: 'WARNING',
          date: item.assignmentDate,
          message: `Rest period between consecutive shifts is under the required ${settings.minRestPeriodHours} hours threshold on ${item.assignmentDate}.`,
        })
      }

      // Multi-Property Travel Buffer Check
      const foreignLocationInstances = await RosterAssignmentDate.findAll({
        where: {
          schedulingResourceId: payload.schedulingResourceId,
          locationId: { [Op.ne]: payload.locationId },
          activeToken: 'ACTIVE',
          status: { [Op.ne]: 'CANCELLED' },
          isDeleted: false,
          assignmentDate: item.assignmentDate,
        },
      })

      if (foreignLocationInstances.length > 0) {
        for (const foreignInst of foreignLocationInstances) {
          const travelBufferMs = settings.minMultiPropertyTravelMinutes * 60 * 1000
          const foreignEnd = new Date(foreignInst.scheduledEnd).getTime()
          const foreignStart = new Date(foreignInst.scheduledStart).getTime()

          if (
            Math.abs(proposedStart.getTime() - foreignEnd) < travelBufferMs ||
            Math.abs(foreignStart - proposedEnd.getTime()) < travelBufferMs
          ) {
            warnings.push({
              code: 'MULTI_PROPERTY_TRAVEL_WARNING',
              severity: 'WARNING',
              date: item.assignmentDate,
              message: `Multi-property duty transition on ${item.assignmentDate} has less than ${settings.minMultiPropertyTravelMinutes} minutes travel buffer.`,
            })
          }
        }
      }

      // Weekly Hours Threshold Check (Only for Employees)
      if (resource.resourceType === 'EMPLOYEE') {
        const yearWeek = getISOWeekKey(proposedStart)
        weeklyHoursMap[yearWeek] = (weeklyHoursMap[yearWeek] || 0) + durationHours
      }
    }

    // Evaluate Weekly Hours Limit for Employees
    if (resource.resourceType === 'EMPLOYEE') {
      for (const [weekKey, totalHours] of Object.entries(weeklyHoursMap)) {
        if (totalHours > settings.maxWeeklyHours) {
          warnings.push({
            code: 'WEEKLY_HOURS_EXCEEDED',
            severity: 'WARNING',
            message: `Total scheduled duty hours for week ${weekKey} (${totalHours.toFixed(1)} hrs) exceeds maximum policy limit of ${settings.maxWeeklyHours} hours.`,
          })
        }
      }
    }

    const isValid = errors.length === 0
    const requiresOverride = warnings.length > 0 && errors.length === 0

    return {
      valid: isValid,
      requiresOverride,
      errors,
      warnings,
    }
  }
}

/**
 * Helper utility to extract ISO Week key (YYYY-Www)
 */
function getISOWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`
}

