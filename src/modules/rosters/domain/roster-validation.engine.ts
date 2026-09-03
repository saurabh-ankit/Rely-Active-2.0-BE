import { Op } from 'sequelize'
import {
  SchedulingResource,
  RosterDoctorProfile,
  RosterDoctorLocation,
  RosterDoctorEngagement,
  RosterAssignmentDate,
  RosterSetting,
  Department,
  UserLocation,
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
  dutyType?: 'SHIFT' | 'OPD_SESSION' | undefined
  targets?: Array<{ targetType: string; targetId: string }> | undefined
  enableOpdSlots?: boolean | undefined
  slotDurationMinutes?: number | undefined
  slotTimeRange?: string | undefined
}

export class RosterValidationEngine {
  public static async validate(payload: ValidateAssignmentPayload): Promise<ValidationEngineResult> {
    const errors: ValidationErrorItem[] = []
    const warnings: ValidationErrorItem[] = []

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

    // Department target validation for employee shifts
    if (payload.dutyType === 'SHIFT' && resource.resourceType === 'EMPLOYEE' && payload.targets?.length) {
      const deptTarget = payload.targets.find((t) => t.targetType === 'DEPARTMENT')
      if (deptTarget) {
        const department = await Department.findByPk(deptTarget.targetId)
        if (!department) {
          errors.push({
            code: 'DEPARTMENT_TARGET_INVALID',
            severity: 'BLOCK',
            message: 'Department target does not exist.',
          })
        } else if (resource.departmentId && resource.departmentId !== deptTarget.targetId) {
          const userLoc = resource.userId
            ? await UserLocation.findOne({
                where: {
                  userId: resource.userId,
                  locId: payload.locationId,
                  departmentId: deptTarget.targetId,
                  isActive: true,
                  isDeleted: false,
                },
              })
            : null
          if (!userLoc) {
            errors.push({
              code: 'EMPLOYEE_DEPARTMENT_MISMATCH',
              severity: 'BLOCK',
              message: 'Employee is not assigned to the selected department at this location.',
            })
          }
        }
      }
    }

    // OPD slot config validation
    if (payload.dutyType === 'OPD_SESSION' || payload.enableOpdSlots) {
      if (!payload.slotTimeRange && payload.proposedDates.length === 0) {
        errors.push({
          code: 'OPD_TIME_REQUIRED',
          severity: 'BLOCK',
          message: 'OPD session requires a valid time range.',
        })
      }
      const duration = payload.slotDurationMinutes ?? 30
      if (duration <= 0) {
        errors.push({
          code: 'OPD_SLOT_DURATION_INVALID',
          severity: 'BLOCK',
          message: 'OPD slot duration must be greater than zero.',
        })
      }
    }

    if (resource.resourceType === 'DOCTOR' && resource.doctorProfile) {
      const doctor = resource.doctorProfile

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
            message:
              'Visiting Doctor has no active contractual engagement covering this location and effective window.',
          })
        }
      }
    }

    const settings = (await RosterSetting.findOne({
      where: { companyId: payload.companyId, locationId: payload.locationId, isDeleted: false },
    })) || {
      minRestPeriodHours: 11,
      maxWeeklyHours: 48,
      minMultiPropertyTravelMinutes: 60,
    }

    const weeklyHoursMap: Record<string, number> = {}
    const skipEmployeePolicy = payload.dutyType === 'OPD_SESSION'

    for (const item of payload.proposedDates) {
      const proposedStart = new Date(item.scheduledStart)
      const proposedEnd = new Date(item.scheduledEnd)
      const durationHours = (proposedEnd.getTime() - proposedStart.getTime()) / (3600 * 1000)

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

      if (!skipEmployeePolicy) {
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
      }

      if (resource.resourceType === 'EMPLOYEE' && !skipEmployeePolicy) {
        const yearWeek = getISOWeekKey(proposedStart)
        weeklyHoursMap[yearWeek] = (weeklyHoursMap[yearWeek] || 0) + durationHours
      }
    }

    if (resource.resourceType === 'EMPLOYEE' && !skipEmployeePolicy) {
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

function getISOWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`
}
