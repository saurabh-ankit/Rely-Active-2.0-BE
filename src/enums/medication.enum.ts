export enum MedicationRoute {
  ORAL = 'oral',
  IV = 'iv',
  IM = 'im',
  SC = 'sc',
  TOPICAL = 'topical',
  INHALATION = 'inhalation',
  RECTAL = 'rectal',
  OTHER = 'other',
}

export enum MedicationMealTiming {
  BEFORE_FOOD = 'before_food',
  AFTER_FOOD = 'after_food',
  WITH_FOOD = 'with_food',
  NONE = 'none',
}

export enum MedicationKind {
  MEDICATION = 'MEDICATION',
  INSULIN = 'INSULIN',
}

export enum MedicationAdministrationStatus {
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum MedicationStockStatus {
  DEDUCTED = 'DEDUCTED',
  INSUFFICIENT = 'INSUFFICIENT',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
}
