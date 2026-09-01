import type { Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { RosterAssignment, RosterAssignmentTarget } from '../../../models/index.js'
import { RosterValidationEngine } from '../../../modules/rosters/domain/roster-validation.engine.js'
import { RosterGenerationService } from '../../../modules/rosters/domain/roster-generation.service.js'

/**
 * Validate Roster Assignment (Pre-flight dry run)
 * POST /api/v1/roster/companies/:companyId/locations/:locationId/assignments/validate
 */
export async function validateAssignment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const companyId = req.params.companyId as string
    const locationId = req.params.locationId as string
    const { schedulingResourceId, effectiveFrom, effectiveUntil, proposedDates, overrideReason } = req.body

    const validation = await RosterValidationEngine.validate({
      companyId,
      locationId,
      schedulingResourceId: schedulingResourceId as string,
      effectiveFrom: effectiveFrom as string,
      effectiveUntil: effectiveUntil as string,
      proposedDates: proposedDates || [],
      overrideReason: overrideReason as string | undefined,
    })

    return res.status(200).json({
      success: true,
      data: validation,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Create Roster Assignment Pattern Header & Targets
 * POST /api/v1/roster/companies/:companyId/locations/:locationId/assignments
 */
export async function createAssignment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const companyId = req.params.companyId as string
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
    } = req.body

    // 1. Create Roster Assignment Pattern Header
    const assignment = await RosterAssignment.create({
      companyId,
      locationId,
      rosterName: rosterName as string,
      dutyType: dutyType || 'SHIFT',
      holidayPolicy: holidayPolicy || 'SKIP',
      schedulingResourceId: schedulingResourceId as string,
      shiftId: shiftId || null,
      slotTimeRange: slotTimeRange || null,
      frequencyId: frequencyId as string,
      effectiveFrom: effectiveFrom as string,
      effectiveUntil: effectiveUntil as string,
      selectedWorkingDays: selectedWorkingDays || null,
      instructions: instructions || null,
      status: 'DRAFT',
      createdBy: req.user?.id || 'system',
      updatedBy: req.user?.id || 'system',
    })

    // 2. Bind Targets
    if (targets && Array.isArray(targets) && targets.length > 0) {
      for (const t of targets) {
        await RosterAssignmentTarget.create({
          rosterAssignmentId: assignment.id,
          targetType: t.targetType,
          targetId: t.targetId,
          createdBy: req.user?.id || 'system',
          updatedBy: req.user?.id || 'system',
        })
      }
    }

    const createdWithTargets = await RosterAssignment.findByPk(assignment.id, {
      include: [{ model: RosterAssignmentTarget, as: 'targets' }],
    })

    return res.status(201).json({
      success: true,
      message: 'Roster assignment pattern created in DRAFT state.',
      data: createdWithTargets,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Publish Assignment & Generate Concrete Date Instances
 * POST /api/v1/roster/companies/:companyId/locations/:locationId/assignments/:assignmentId/publish
 */
export async function publishAssignment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const companyId = req.params.companyId as string
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
      message: `Roster assignment published successfully! Generated ${result.generatedCount} operational date instances.`,
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Copy Roster Pattern to Future Date Window (P1 Copy-Forward Feature)
 * POST /api/v1/roster/companies/:companyId/locations/:locationId/assignments/:assignmentId/copy-forward
 */
export async function copyAssignment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const companyId = req.params.companyId as string
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

    // Duplicate pattern header
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
      status: 'DRAFT',
      createdBy: req.user?.id || 'system',
      updatedBy: req.user?.id || 'system',
    })

    // Duplicate targets
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
