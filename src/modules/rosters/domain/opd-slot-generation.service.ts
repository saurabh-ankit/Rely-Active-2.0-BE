import { Transaction } from 'sequelize'
import { RosterAssignmentDate, RosterOpdSlot, RosterDoctorEngagement } from '../../../models/index.js'
import type { RosterAssignment } from '../../../models/rosterAssignment.model.js'
import { calculateOpdSlotDefinitions } from './opd-slot.util.js'

export interface GenerateOpdSlotsPayload {
  assignment: RosterAssignment
  dateInstance: RosterAssignmentDate
  locationId: string
  performedBy: string
  transaction: Transaction
}

export class OpdSlotGenerationService {
  public static async resolveSlotCapacity(assignment: RosterAssignment, locationId: string): Promise<number> {
    if (assignment.resource?.doctorProfile) {
      const engagement = await RosterDoctorEngagement.findOne({
        where: {
          doctorProfileId: assignment.resource.doctorProfile.id,
          locationId,
          status: 'ACTIVE',
          isDeleted: false,
        },
        order: [['validFrom', 'DESC']],
      })
      if (engagement?.defaultSlotCapacity) return engagement.defaultSlotCapacity
      if (assignment.resource.doctorProfile.maxPatientsPerSlot) {
        return assignment.resource.doctorProfile.maxPatientsPerSlot
      }
    }
    return 1
  }

  public static resolveSlotDurationMinutes(assignment: RosterAssignment): number {
    if (assignment.slotDurationMinutes && assignment.slotDurationMinutes > 0) {
      return assignment.slotDurationMinutes
    }
    if (assignment.resource?.doctorProfile?.defaultSlotDurationMinutes) {
      return assignment.resource.doctorProfile.defaultSlotDurationMinutes
    }
    if (assignment.shift?.slotDurationMinutes) {
      return assignment.shift.slotDurationMinutes
    }
    return 30
  }

  public static async generateSlotsForDate(payload: GenerateOpdSlotsPayload): Promise<number> {
    const { assignment, dateInstance, performedBy, transaction } = payload

    if (assignment.dutyType !== 'OPD_SESSION' && !assignment.enableOpdSlots) {
      return 0
    }

    const slotDurationMinutes = OpdSlotGenerationService.resolveSlotDurationMinutes(assignment)
    const bufferMinutes = assignment.slotBufferMinutes || 0
    const maxCapacity = await OpdSlotGenerationService.resolveSlotCapacity(assignment, payload.locationId)

    const definitions = calculateOpdSlotDefinitions(
      dateInstance.assignmentDate,
      dateInstance.slotTimeRange,
      slotDurationMinutes,
      bufferMinutes,
    )

    if (definitions.length === 0) {
      throw new Error('Unable to generate OPD slots — invalid time range or slot duration.')
    }

    let count = 0
    for (const def of definitions) {
      await RosterOpdSlot.create(
        {
          rosterAssignmentDateId: dateInstance.id,
          slotNumber: def.slotNumber,
          scheduledStart: def.scheduledStart,
          scheduledEnd: def.scheduledEnd,
          maxCapacity,
          bookedCount: 0,
          status: 'AVAILABLE',
          activeToken: 'ACTIVE',
          createdBy: performedBy,
          updatedBy: performedBy,
        },
        { transaction },
      )
      count++
    }

    return count
  }
}
