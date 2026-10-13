import { Op } from 'sequelize'
import { SOP_INCIDENT_TYPES, type IncidentType } from '../enums/incident.enum.js'
import { HttpError } from '../middlewares/error/http-error.js'
import { IncidentSopStep, ResidentIncident, ResidentIncidentSopStep } from '../models/index.js'
import type { UpdateIncidentSopStepInput } from '../validations/residentIncident.validation.js'
import { getClinicalResident } from './residentClinical.service.js'
import { userInclude, userName } from './residentCondition.service.js'

export interface IncidentSopSummary {
  total: number
  completed: number
  mandatoryTotal: number
  mandatoryCompleted: number
  /** Every mandatory step is done. */
  isComplete: boolean
}

export const hasSop = (incidentType: IncidentType) => SOP_INCIDENT_TYPES.includes(incidentType)

function loadStepDefinitions(incidentTypes: IncidentType[]) {
  return IncidentSopStep.findAll({
    where: { incidentType: { [Op.in]: incidentTypes }, isActive: true },
    order: [
      ['sortOrder', 'ASC'],
      ['createdAt', 'ASC'],
    ],
  })
}

function summarize(steps: { isMandatory: boolean; isCompleted: boolean }[]): IncidentSopSummary {
  const mandatory = steps.filter((s) => s.isMandatory)
  const mandatoryCompleted = mandatory.filter((s) => s.isCompleted).length
  return {
    total: steps.length,
    completed: steps.filter((s) => s.isCompleted).length,
    mandatoryTotal: mandatory.length,
    mandatoryCompleted,
    isComplete: mandatoryCompleted === mandatory.length,
  }
}

/** SOP progress summary per incident id (only incidents whose type has an SOP). */
export async function getSopSummaries(
  incidents: { id: string; incidentType: IncidentType }[],
): Promise<Map<string, IncidentSopSummary>> {
  const result = new Map<string, IncidentSopSummary>()
  const sopIncidents = incidents.filter((i) => hasSop(i.incidentType))
  if (sopIncidents.length === 0) return result

  const types = [...new Set(sopIncidents.map((i) => i.incidentType))]
  const [definitions, progress] = await Promise.all([
    loadStepDefinitions(types),
    ResidentIncidentSopStep.findAll({
      where: { incidentId: { [Op.in]: sopIncidents.map((i) => i.id) }, isCompleted: true },
      attributes: ['incidentId', 'sopStepId'],
    }),
  ])

  const completedByIncident = new Map<string, Set<string>>()
  for (const row of progress) {
    const set = completedByIncident.get(row.incidentId) ?? new Set<string>()
    set.add(row.sopStepId)
    completedByIncident.set(row.incidentId, set)
  }

  for (const incident of sopIncidents) {
    const done = completedByIncident.get(incident.id) ?? new Set<string>()
    const steps = definitions
      .filter((d) => d.incidentType === incident.incidentType)
      .map((d) => ({ isMandatory: d.isMandatory, isCompleted: done.has(d.id) }))
    result.set(incident.id, summarize(steps))
  }
  return result
}

async function loadSopIncident(residentId: string, incidentId: string) {
  await getClinicalResident(residentId)
  const incident = await ResidentIncident.findOne({ where: { id: incidentId, residentId, isDeleted: false } })
  if (!incident) throw new HttpError(404, 'Incident not found')
  if (!hasSop(incident.incidentType)) throw new HttpError(400, 'This incident type has no SOP')
  return incident
}

/** The incident's SOP steps merged with their progress. */
export async function getIncidentSop(residentId: string, incidentId: string) {
  const incident = await loadSopIncident(residentId, incidentId)

  const [definitions, progress] = await Promise.all([
    loadStepDefinitions([incident.incidentType]),
    ResidentIncidentSopStep.findAll({
      where: { incidentId },
      include: [userInclude('completer')],
    }),
  ])
  const progressByStep = new Map(progress.map((row) => [row.sopStepId, row]))

  const steps = definitions.map((definition) => {
    const row = progressByStep.get(definition.id)
    const isCompleted = !!row?.isCompleted
    return {
      id: definition.id,
      stepKey: definition.stepKey,
      title: definition.title,
      isMandatory: definition.isMandatory,
      sortOrder: definition.sortOrder,
      isCompleted,
      completedAt: isCompleted && row?.completedAt ? new Date(row.completedAt).toISOString() : null,
      completedByName: isCompleted ? userName(row?.completer) : null,
      note: row?.note ?? null,
    }
  })

  return {
    incident: {
      id: incident.id,
      incidentType: incident.incidentType,
      severity: incident.severity,
      incidentAt: new Date(incident.incidentAt).toISOString(),
    },
    steps,
    summary: summarize(steps),
  }
}

/** Marks a step done / not done and/or saves its note. */
export async function updateIncidentSopStep(params: {
  residentId: string
  incidentId: string
  stepId: string
  input: UpdateIncidentSopStepInput
  userId: string | null
}) {
  const { residentId, incidentId, stepId, input, userId } = params
  const incident = await loadSopIncident(residentId, incidentId)

  const step = await IncidentSopStep.findOne({
    where: { id: stepId, incidentType: incident.incidentType, isActive: true },
  })
  if (!step) throw new HttpError(404, 'SOP step not found for this incident')

  const existing = await ResidentIncidentSopStep.findOne({ where: { incidentId, sopStepId: stepId } })
  const changes: Partial<{
    isCompleted: boolean
    completedAt: Date | null
    completedBy: string | null
    note: string | null
  }> = {}
  if (input.isCompleted !== undefined) {
    changes.isCompleted = input.isCompleted
    changes.completedAt = input.isCompleted ? new Date() : null
    changes.completedBy = input.isCompleted ? userId : null
  }
  if (input.note !== undefined) changes.note = input.note ?? null

  if (existing) {
    await existing.update({ ...changes, updatedBy: userId })
  } else {
    await ResidentIncidentSopStep.create({
      incidentId,
      sopStepId: stepId,
      isCompleted: false,
      ...changes,
      createdBy: userId,
      updatedBy: userId,
    })
  }

  return getIncidentSop(residentId, incidentId)
}
