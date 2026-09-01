import type { Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { RosterAssignment, RosterAssignmentTarget, SchedulingResource, RosterFrequency } from '../../../models/index.js'
import type { RosterTargetType } from '../../../models/rosterAssignmentTarget.model.js'
import { RosterValidationEngine } from '../../../modules/rosters/domain/roster-validation.engine.js'
import { RosterGenerationService } from '../../../modules/rosters/domain/roster-generation.service.js'
import { resolveCompanyId } from '../../../utils/resolveCompanyId.js'

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

async function resolveSchedulingResourceId(companyId: string, rawResourceId?: string): Promise<string> {
  if (rawResourceId && UUID_REGEX.test(rawResourceId)) {
    return rawResourceId
  }
  const existing = await SchedulingResource.findOne({ where: { companyId, isDeleted: false } })
  if (existing) {
    return existing.id
  }
  const created = await SchedulingResource.create({
    companyId,
    resourceType: 'EMPLOYEE',
    status: 'ACTIVE',
    effectiveFrom: '2026-01-01',
  })
  return created.id
}

async function resolveFrequencyId(companyId: string, locationId: string, rawFrequencyId?: string): Promise<string> {
  if (rawFrequencyId && UUID_REGEX.test(rawFrequencyId)) {
    return rawFrequencyId
  }
  const existing = await RosterFrequency.findOne({ where: { companyId, isDeleted: false } })
  if (existing) {
    return existing.id
  }
  const created = await RosterFrequency.create({
    companyId,
    locationId,
    frequencyName: rawFrequencyId || 'WEEKLY',
    frequencyType: 'WEEKLY',
    interval: 1,
    timeUnit: 'WEEKS',
    status: 'ACTIVE',
  })
  return created.id
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

/**
 * Validate Roster Assignment (Pre-flight dry run)
 * POST /api/v1/roster/companies/:companyId/locations/:locationId/assignments/validate
 */
export async function validateAssignment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const companyId = await resolveCompanyId(req.params.companyId as string, req.user?.companyId)
    const locationId = req.params.locationId as string
    const { schedulingResourceId, effectiveFrom, effectiveUntil, proposedDates, overrideReason } = req.body

    const resolvedResourceId = await resolveSchedulingResourceId(companyId, schedulingResourceId as string)

    const validation = await RosterValidationEngine.validate({
      companyId,
      locationId,
      schedulingResourceId: resolvedResourceId,
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
    } = req.body

    const resolvedResourceId = await resolveSchedulingResourceId(companyId, schedulingResourceId as string)
    const resolvedFreqId = await resolveFrequencyId(companyId, locationId, frequencyId as string)

    // 1. Create Roster Assignment Pattern Header
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
      status: 'DRAFT',
      createdBy: req.user?.id || 'system',
      updatedBy: req.user?.id || 'system',
    })

    // 2. Bind Targets
    if (targets && Array.isArray(targets) && targets.length > 0) {
      for (const t of targets) {
        await RosterAssignmentTarget.create({
          rosterAssignmentId: assignment.id,
          targetType: mapTargetType(t.targetType),
          targetId: cleanTargetId(t.targetId),
          createdBy: req.user?.id || 'system',
          updatedBy: req.user?.id || 'system',
        })
      }
    }

    // 3. Auto-publish assignment pattern to generate concrete date instances
    try {
      await RosterGenerationService.generateDatesForAssignment({
        rosterAssignmentId: assignment.id,
        companyId,
        locationId,
        performedBy: req.user?.id || 'system',
      })
    } catch (pubErr) {
      console.warn('Auto-publish during assignment creation warning:', pubErr)
    }

    const createdWithTargets = await RosterAssignment.findByPk(assignment.id, {
      include: [{ model: RosterAssignmentTarget, as: 'targets' }],
    })

    return res.status(201).json({
      success: true,
      message: 'Roster assignment pattern created and published successfully.',
      data: createdWithTargets,
    })
  } catch (error) {
    console.error('CREATE ASSIGNMENT ERROR:', error)
    next(error)
  }
}

/**
 * Publish Assignment & Generate Concrete Date Instances
 * POST /api/v1/roster/companies/:companyId/locations/:locationId/assignments/:assignmentId/publish
 */
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
      message: `Roster assignment published successfully! Generated ${result.generatedCount} operational date instances.`,
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Get Roster Assignments List
 * GET /api/v1/roster/companies/:companyId/locations/:locationId/assignments
 */
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

/**
 * Copy Roster Pattern to Future Date Window (P1 Copy-Forward Feature)
 * POST /api/v1/roster/companies/:companyId/locations/:locationId/assignments/:assignmentId/copy-forward
 */
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
