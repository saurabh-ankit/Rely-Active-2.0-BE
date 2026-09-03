import type { Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { RosterAssignment, RosterAssignmentTarget, RosterFrequency, Department } from '../../../models/index.js'
import type { RosterTargetType } from '../../../models/rosterAssignmentTarget.model.js'
import { RosterValidationEngine } from '../../../modules/rosters/domain/roster-validation.engine.js'
import { RosterGenerationService } from '../../../modules/rosters/domain/roster-generation.service.js'
import { SchedulingResourceService } from '../../../modules/rosters/domain/scheduling-resource.service.js'
import { resolveCompanyId } from '../../../utils/resolveCompanyId.js'

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

async function resolveFrequencyId(companyId: string, locationId: string, rawFrequencyId?: string): Promise<string> {
  if (rawFrequencyId && UUID_REGEX.test(rawFrequencyId)) {
    const freq = await RosterFrequency.findOne({ where: { id: rawFrequencyId, companyId, isDeleted: false } })
    if (freq) return freq.id
  }

  const existing = await RosterFrequency.findOne({ where: { companyId, locationId, isDeleted: false } })
  if (existing) return existing.id

  throw new Error('Valid frequencyId is required. Create a frequency template first.')
}

function mapTargetType(rawType: string): RosterTargetType {
  const upper = (rawType || '').toUpperCase()
  if (upper === 'FLOOR' || upper === 'PROPERTY_FLOOR') return 'PROPERTY_FLOOR'
  if (upper === 'UNIT' || upper === 'ROOM_UNIT' || upper === 'PROPERTY_UNIT') return 'PROPERTY_UNIT'
  if (upper === 'BLOCK' || upper === 'PROPERTY_BLOCK') return 'PROPERTY_BLOCK'
  if (upper === 'PROPERTY') return 'PROPERTY'
  if (upper === 'CLINIC_VENUE' || upper === 'CLINIC') return 'CLINIC_VENUE'
  if (upper === 'DEPARTMENT') return 'DEPARTMENT'
  if (upper === 'SERVICE') return 'SERVICE'
  return 'PROPERTY_FLOOR'
}

function cleanTargetId(rawId: string): string {
  if (!rawId) return rawId
  return rawId.replace(/^(prop|block|floor|unit|clinic|dept)-/, '')
}

async function validateDepartmentTargets(
  targets: Array<{ targetType: string; targetId: string }>,
): Promise<string | null> {
  for (const t of targets) {
    if (mapTargetType(t.targetType) === 'DEPARTMENT') {
      const dept = await Department.findByPk(cleanTargetId(t.targetId))
      if (!dept) return `Department target ${t.targetId} does not exist.`
    }
  }
  return null
}

export async function validateAssignment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const companyId = await resolveCompanyId(req.params.companyId as string, req.user?.companyId)
    const locationId = req.params.locationId as string
    const {
      schedulingResourceId,
      effectiveFrom,
      effectiveUntil,
      proposedDates,
      overrideReason,
      dutyType,
      targets,
      enableOpdSlots,
      slotDurationMinutes,
      slotTimeRange,
    } = req.body

    const resolvedResourceId = await SchedulingResourceService.resolveSchedulingResourceId(
      companyId,
      schedulingResourceId as string,
      locationId,
    )

    const mappedTargets =
      targets && Array.isArray(targets)
        ? targets.map((t: { targetType: string; targetId: string }) => ({
            targetType: mapTargetType(t.targetType),
            targetId: cleanTargetId(t.targetId),
          }))
        : []

    const validation = await RosterValidationEngine.validate({
      companyId,
      locationId,
      schedulingResourceId: resolvedResourceId,
      effectiveFrom: effectiveFrom as string,
      effectiveUntil: effectiveUntil as string,
      proposedDates: proposedDates || [],
      overrideReason: overrideReason as string | undefined,
      dutyType: dutyType as 'SHIFT' | 'OPD_SESSION' | undefined,
      targets: mappedTargets,
      enableOpdSlots: enableOpdSlots as boolean | undefined,
      slotDurationMinutes: slotDurationMinutes as number | undefined,
      slotTimeRange: slotTimeRange as string | undefined,
    })

    return res.status(200).json({ success: true, data: validation })
  } catch (error) {
    next(error)
  }
}

export async function createAssignment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const companyId = await resolveCompanyId(req.params.companyId as string, req.user?.companyId)
    const locationId = req.params.locationId as string
    const {
      rosterName,
      dutyType,
      holidayPolicy,
      schedulingResourceId,
      shiftId,
      slotTimeRange,
      frequencyId,
      effectiveFrom,
      effectiveUntil,
      selectedWorkingDays,
      instructions,
      targets,
      enableOpdSlots,
      slotDurationMinutes,
      slotBufferMinutes,
      overrideReason,
    } = req.body

    const mappedTargets =
      targets && Array.isArray(targets)
        ? targets.map((t: { targetType: string; targetId: string }) => ({
            targetType: mapTargetType(t.targetType),
            targetId: cleanTargetId(t.targetId),
          }))
        : []

    const deptError = await validateDepartmentTargets(mappedTargets)
    if (deptError) {
      return res.status(422).json({ success: false, message: deptError })
    }

    const resolvedResourceId = await SchedulingResourceService.resolveSchedulingResourceId(
      companyId,
      schedulingResourceId as string,
      locationId,
    )
    const resolvedFreqId = await resolveFrequencyId(companyId, locationId, frequencyId as string)

    const assignment = await RosterAssignment.create({
      companyId,
      locationId,
      rosterName: rosterName as string,
      dutyType: dutyType || 'SHIFT',
      holidayPolicy: holidayPolicy || 'SKIP',
      schedulingResourceId: resolvedResourceId,
      shiftId: shiftId || null,
      slotTimeRange: slotTimeRange || null,
      frequencyId: resolvedFreqId,
      effectiveFrom: effectiveFrom as string,
      effectiveUntil: effectiveUntil as string,
      selectedWorkingDays: selectedWorkingDays || null,
      instructions: instructions || null,
      slotDurationMinutes: slotDurationMinutes ?? null,
      slotBufferMinutes: slotBufferMinutes ?? 0,
      enableOpdSlots: enableOpdSlots ?? dutyType === 'OPD_SESSION',
      status: 'DRAFT',
      createdBy: req.user?.id || 'system',
      updatedBy: req.user?.id || 'system',
    })

    for (const t of mappedTargets) {
      await RosterAssignmentTarget.create({
        rosterAssignmentId: assignment.id,
        targetType: t.targetType,
        targetId: t.targetId,
        createdBy: req.user?.id || 'system',
        updatedBy: req.user?.id || 'system',
      })
    }

    const publishResult = await RosterGenerationService.generateDatesForAssignment({
      rosterAssignmentId: assignment.id,
      companyId,
      locationId,
      overrideReason: overrideReason as string | undefined,
      performedBy: req.user?.id || 'system',
    })

    if (!publishResult.success) {
      return res.status(422).json({
        success: false,
        message: 'Roster assignment created but publication blocked by validation.',
        data: publishResult.validationResult,
      })
    }

    const createdWithTargets = await RosterAssignment.findByPk(assignment.id, {
      include: [{ model: RosterAssignmentTarget, as: 'targets' }],
    })

    return res.status(201).json({
      success: true,
      message: `Roster assignment created and published. Generated ${publishResult.generatedCount} dates and ${publishResult.opdSlotsGenerated} OPD slots.`,
      data: { assignment: createdWithTargets, publishResult },
    })
  } catch (error) {
    console.error('CREATE ASSIGNMENT ERROR:', error)
    next(error)
  }
}

export async function publishAssignment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const companyId = await resolveCompanyId(req.params.companyId as string, req.user?.companyId)
    const locationId = req.params.locationId as string
    const assignmentId = req.params.assignmentId as string
    const { overrideReason } = req.body

    const result = await RosterGenerationService.generateDatesForAssignment({
      rosterAssignmentId: assignmentId,
      companyId,
      locationId,
      overrideReason: overrideReason as string | undefined,
      performedBy: req.user?.id || 'system',
    })

    if (!result.success) {
      return res.status(422).json({
        success: false,
        message: 'Roster publication blocked by validation engine or missing override reason.',
        data: result.validationResult,
      })
    }

    return res.status(200).json({
      success: true,
      message: `Roster assignment published! Generated ${result.generatedCount} date instances and ${result.opdSlotsGenerated} OPD slots.`,
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

export async function getAssignments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const companyId = await resolveCompanyId(req.params.companyId as string, req.user?.companyId)
    const locationId = req.params.locationId as string

    const assignments = await RosterAssignment.findAll({
      where: { companyId, locationId, isDeleted: false },
      include: [{ model: RosterAssignmentTarget, as: 'targets' }],
      order: [['createdAt', 'DESC']],
    })

    return res.status(200).json({
      success: true,
      message: 'Roster assignments fetched successfully.',
      data: assignments,
    })
  } catch (error) {
    next(error)
  }
}

export async function copyAssignment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const companyId = await resolveCompanyId(req.params.companyId as string, req.user?.companyId)
    const locationId = req.params.locationId as string
    const assignmentId = req.params.assignmentId as string
    const { targetEffectiveFrom, targetEffectiveUntil, newRosterName } = req.body

    const existing = await RosterAssignment.findOne({
      where: { id: assignmentId, companyId, locationId, isDeleted: false },
      include: [{ model: RosterAssignmentTarget, as: 'targets' }],
    })

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Source roster assignment pattern not found.' })
    }

    const copiedAssignment = await RosterAssignment.create({
      companyId,
      locationId,
      rosterName: newRosterName || `${existing.rosterName} (Copy)`,
      dutyType: existing.dutyType,
      holidayPolicy: existing.holidayPolicy,
      schedulingResourceId: existing.schedulingResourceId,
      shiftId: existing.shiftId,
      slotTimeRange: existing.slotTimeRange,
      frequencyId: existing.frequencyId,
      effectiveFrom: targetEffectiveFrom as string,
      effectiveUntil: targetEffectiveUntil as string,
      selectedWorkingDays: existing.selectedWorkingDays,
      instructions: existing.instructions,
      slotDurationMinutes: existing.slotDurationMinutes,
      slotBufferMinutes: existing.slotBufferMinutes,
      enableOpdSlots: existing.enableOpdSlots,
      status: 'DRAFT',
      createdBy: req.user?.id || 'system',
      updatedBy: req.user?.id || 'system',
    })

    if (existing.targets && existing.targets.length > 0) {
      for (const t of existing.targets) {
        await RosterAssignmentTarget.create({
          rosterAssignmentId: copiedAssignment.id,
          targetType: t.targetType,
          targetId: t.targetId,
          createdBy: req.user?.id || 'system',
          updatedBy: req.user?.id || 'system',
        })
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Roster pattern cloned successfully to new target date range.',
      data: copiedAssignment,
    })
  } catch (error) {
    next(error)
  }
}
