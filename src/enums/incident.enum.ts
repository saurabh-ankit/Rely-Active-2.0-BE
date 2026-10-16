export enum IncidentType {
  FALL_INJURY = 'fall_injury',
  SKIN_WOUND = 'skin_wound',
  BEHAVIOR = 'behavior',
  ENV_TEMP = 'env_temp',
  BATHROOM = 'bathroom',
  REFUSAL = 'refusal',
  OTHER = 'other',
}

export enum IncidentSeverity {
  LOW = 'low',
  MODERATE = 'moderate',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/** Incident types that come with a Standard Operating Procedure checklist. */
export const SOP_INCIDENT_TYPES: readonly IncidentType[] = [IncidentType.SKIN_WOUND, IncidentType.FALL_INJURY]

export enum SkinWoundSopStep {
  TEST = 'test',
  FIRST_AID = 'first_aid',
  MEDICINES = 'medicines',
  BED_REST = 'bed_rest',
}

export enum FallInjurySopStep {
  CHECK_1 = 'check_1',
  STEP_1 = 'step_1',
  STEP_2 = 'step_2',
  STEP_3 = 'step_3',
  QWERTYU = 'qwertyu',
  STEP_234567 = 'step_234567',
  STEP_12345678 = 'step_12345678',
}

export const IncidentSopStepKey = { ...SkinWoundSopStep, ...FallInjurySopStep } as const
export type IncidentSopStepKey = SkinWoundSopStep | FallInjurySopStep
