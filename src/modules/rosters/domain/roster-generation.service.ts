import { Transaction } from 'sequelize'
import sequelize from '../../../config/db/index.js'
import {
  RosterAssignment,
  RosterFrequency,
  RosterAssignmentTarget,
  RosterAssignmentDate,
  RosterShift,
  SchedulingResource,
  User,
  RosterDoctorProfile,
} from '../../../models/index.js'
import { RosterValidationEngine } from './roster-validation.engine.js'

export interface GenerateRosterInstancesPayload {
  rosterAssignmentId: string
  companyId: string
  locationId: string
  overrideReason?: string | undefined
  performedBy: string
}


export class RosterGenerationService {
  /**
   * Expands a RosterAssignment + RosterFrequency into concrete RosterAssignmentDate records inside a MySQL transaction.
   */
  public static async generateDatesForAssignment(payload: GenerateRosterInstancesPayload): Promise<{
    success: boolean
    generatedCount: number
    validationResult: Awaited<ReturnType<typeof RosterValidationEngine.validate>>
  }> {
    const transaction: Transaction = await sequelize.transaction()

    try {
      // 1. Fetch Assignment with Frequency, Shift & Targets
      const assignment = await RosterAssignment.findOne({
        where: {
          id: payload.rosterAssignmentId,
          companyId: payload.companyId,
          locationId: payload.locationId,
          isDeleted: false,
        },
        include: [
          { model: RosterFrequency, as: 'frequency' },
          { model: RosterShift, as: 'shift' },
          { model: RosterAssignmentTarget, as: 'targets' },
          {
            model: SchedulingResource,
            as: 'resource',
            include: [
              { model: User, as: 'user' },
              { model: RosterDoctorProfile, as: 'doctorProfile' },
            ],
          },
        ],
        transaction,
        lock: transaction.LOCK.UPDATE, // MySQL Pessimistic Lock
      })

      if (!assignment) {
        await transaction.rollback()
        throw new Error('Roster Assignment header not found.')
      }

      // 2. Build human-readable resource and target snapshots
      let resourceSnapshot = 'Unknown Resource'
      if (assignment.resource) {
        if (assignment.resource.resourceType === 'EMPLOYEE' && assignment.resource.user) {
          const userName = assignment.resource.user.username || assignment.resource.user.email || 'Employee'
          resourceSnapshot = `${userName} (ID: ${assignment.resource.userId})`
        } else if (assignment.resource.resourceType === 'DOCTOR' && assignment.resource.doctorProfile) {

          resourceSnapshot = `Dr. ${assignment.resource.doctorProfile.specialization} (License: ${assignment.resource.doctorProfile.medicalLicenseNumber})`
        }
      }

      const targetSnapshots =
        assignment.targets && assignment.targets.length > 0
          ? assignment.targets.map((t) => `${t.targetType}:${t.targetId}`).join(', ')
          : 'Location Target'

      const shiftNameSnapshot = assignment.shift ? assignment.shift.shiftName : 'OPD Slot'
      const slotTimeRange = assignment.slotTimeRange || (assignment.shift ? `${assignment.shift.startTime} - ${assignment.shift.endTime}` : '09:00 - 17:00')

      // 3. Compute Dates based on Frequency & Date Window
      const startDate = new Date(assignment.effectiveFrom)
      const endDate = new Date(assignment.effectiveUntil)
      const proposedDates: Array<{
        assignmentDate: string
        scheduledStart: Date
        scheduledEnd: Date
        slotTimeRange: string
      }> = []

      const curr = new Date(startDate)
      const daysOfWeekMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

      while (curr <= endDate) {
        const dateStr: string = curr.toISOString().split('T')[0] || ''
        const dayName: string = daysOfWeekMap[curr.getDay()] || 'sunday'

        let isMatch = true
        const allowedDays = assignment.selectedWorkingDays || (assignment.frequency?.allowedDaysOfWeek)
        if (allowedDays && Array.isArray(allowedDays) && allowedDays.length > 0) {
          const lowerDays = allowedDays.map((d: string) => String(d).toLowerCase())
          const shortDay = dayName.substring(0, 3)
          isMatch = lowerDays.includes(dayName) || lowerDays.includes(shortDay)
        }

        if (isMatch) {
          let startTimeStr = '09:00'
          let endTimeStr = '17:00'
          if (assignment.shift) {
            startTimeStr = assignment.shift.startTime
            endTimeStr = assignment.shift.endTime
          } else if (assignment.slotTimeRange) {
            const parts = assignment.slotTimeRange.split('-').map((s) => s.trim())
            if (parts.length === 2 && parts[0] && parts[1]) {
              startTimeStr = parts[0]
              endTimeStr = parts[1]
            }
          }


          const scheduledStart = new Date(`${dateStr}T${startTimeStr}:00.000Z`)
          let scheduledEnd = new Date(`${dateStr}T${endTimeStr}:00.000Z`)

          // Handle Overnight Shift
          if (scheduledEnd <= scheduledStart) {
            scheduledEnd = new Date(scheduledEnd.getTime() + 24 * 3600 * 1000)
          }

          proposedDates.push({
            assignmentDate: dateStr,
            scheduledStart,
            scheduledEnd,
            slotTimeRange,
          })
        }

        // Increment day
        curr.setDate(curr.getDate() + 1)
      }

      // 4. Execute Validation Engine Pre-Flight Check
      const validationResult = await RosterValidationEngine.validate({
        companyId: payload.companyId,
        locationId: payload.locationId,
        schedulingResourceId: assignment.schedulingResourceId,
        effectiveFrom: assignment.effectiveFrom,
        effectiveUntil: assignment.effectiveUntil,
        proposedDates,
        overrideReason: payload.overrideReason,
      })

      if (!validationResult.valid) {
        await transaction.rollback()
        return {
          success: false,
          generatedCount: 0,
          validationResult,
        }
      }

      if (validationResult.requiresOverride && !payload.overrideReason) {
        await transaction.rollback()
        return {
          success: false,
          generatedCount: 0,
          validationResult,
        }
      }

      // 5. Persist RosterAssignmentDate Records with activeToken = 'ACTIVE'
      let generatedCount = 0
      for (const pDate of proposedDates) {
        await RosterAssignmentDate.create(
          {
            companyId: payload.companyId,
            locationId: payload.locationId,
            rosterAssignmentId: assignment.id,
            assignmentDate: pDate.assignmentDate,
            schedulingResourceId: assignment.schedulingResourceId,
            shiftId: assignment.shiftId,
            scheduledStart: pDate.scheduledStart,
            scheduledEnd: pDate.scheduledEnd,
            slotTimeRange: pDate.slotTimeRange,
            shiftNameSnapshot,
            targetSnapshot: targetSnapshots,
            resourceSnapshot,
            status: 'UPCOMING',
            activeToken: 'ACTIVE',
            overrideReason: payload.overrideReason || null,
            createdBy: payload.performedBy,
            updatedBy: payload.performedBy,
          },
          { transaction },
        )
        generatedCount++
      }

      // 6. Update Assignment Header Status to PUBLISHED
      await assignment.update(
        {
          status: 'PUBLISHED',
          updatedBy: payload.performedBy,
        },
        { transaction },
      )

      await transaction.commit()

      return {
        success: true,
        generatedCount,
        validationResult,
      }
    } catch (err) {
      await transaction.rollback()
      throw err
    }
  }
}
