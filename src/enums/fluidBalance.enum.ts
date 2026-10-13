export enum FluidBalanceCategory {
  INTAKE = 'INTAKE',
  OUTPUT = 'OUTPUT',
  BOWEL = 'BOWEL',
}

export enum FluidIntakeType {
  ORAL_NG = 'oral_ng',
  NASAL_FEED = 'nasal_feed',
  IV_FLUIDS = 'iv_fluids',
}

export enum IvFluidType {
  NS = 'ns',
  NS_WITH_INJECTION = 'ns_with_injection',
  DNS = 'dns',
  RL = 'rl',
  D5 = 'd5',
  D25 = 'd25',
}

export enum FluidOutputType {
  URINE = 'urine',
  VOMIT_DRAIN = 'vomit_drain',
}

export enum FluidUnit {
  ML = 'ml',
  L = 'l',
}

export enum StoolType {
  HARD = 'hard',
  NORMAL = 'normal',
  LOOSE = 'loose',
}

export enum BowelComfortLevel {
  EASY = 'easy',
  STRAINED = 'strained',
  PAINFUL = 'painful',
}
