// ─────────────────────────────────────────────────────────────────────────────
// Flat billing (ported from Rely Assist). An invoice is computed live from the
// source modules for a date range and saved as a snapshot of service lines.
// ─────────────────────────────────────────────────────────────────────────────

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  PAID = 'PAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  CANCELLED = 'CANCELLED',
  OVERDUE = 'OVERDUE',
  OBSOLETE = 'OBSOLETE',
  CARRY_FORWARDED = 'CARRY_FORWARDED',
}

/** Invoices in these states no longer count as billed (their lines can be billed again). */
export const VOID_INVOICE_STATUSES = [InvoiceStatus.CANCELLED] as const

/**
 * Carried forward into a newer invoice: still billed (its charges are not billed again), but its
 * balance is owed on the newer invoice. New carry-forwards use OBSOLETE, which is permanent;
 * CARRY_FORWARDED is the older name for the same state.
 */
export const CARRIED_INVOICE_STATUSES = [InvoiceStatus.OBSOLETE, InvoiceStatus.CARRY_FORWARDED] as const

/** Invoices that still have money owed on them (candidates for payment / carry-forward). */
export const OPEN_INVOICE_STATUSES = [
  InvoiceStatus.PENDING,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
] as const

export enum BillingMode {
  /** Calendar month; rent and packages billed in advance, last month's packages reconciled. */
  MONTHLY = 'MONTHLY',
  /** Any date range; rent and packages prorated by active days. */
  CUSTOM = 'CUSTOM',
}

export enum ServiceType {
  RENT = 'RENT',
  CARE_PACKAGE = 'CARE_PACKAGE',
  FOOD_PACKAGE = 'FOOD_PACKAGE',
  FOOD_ORDER = 'FOOD_ORDER',
  ADDITIONAL_TASK = 'ADDITIONAL_TASK',
  DOCTOR_CONSULTATION = 'DOCTOR_CONSULTATION',
  LAB_TEST = 'LAB_TEST',
  INVENTORY_ITEM = 'INVENTORY_ITEM',
  EVENT_FEE = 'EVENT_FEE',
  VENUE_BOOKING = 'VENUE_BOOKING',
  MAINTENANCE = 'MAINTENANCE',
  MISCELLANEOUS_AS_SERVICE = 'MISCELLANEOUS_AS_SERVICE',
  MISCELLANEOUS_AT_BILLING = 'MISCELLANEOUS_AT_BILLING',
  CARRY_FORWARD = 'CARRY_FORWARD',
}

/** Billed per period (in advance for MONTHLY, prorated for CUSTOM). */
export const RECURRING_SERVICE_TYPES = [ServiceType.RENT, ServiceType.CARE_PACKAGE, ServiceType.FOOD_PACKAGE] as const

/** Billed once per source record, by service date. */
export const USAGE_SERVICE_TYPES = [
  ServiceType.FOOD_ORDER,
  ServiceType.ADDITIONAL_TASK,
  ServiceType.DOCTOR_CONSULTATION,
  ServiceType.LAB_TEST,
  ServiceType.INVENTORY_ITEM,
  ServiceType.EVENT_FEE,
  ServiceType.VENUE_BOOKING,
  ServiceType.MAINTENANCE,
  ServiceType.MISCELLANEOUS_AS_SERVICE,
] as const

export enum PaymentMethod {
  CASH = 'CASH',
  UPI = 'UPI',
  CHEQUE = 'CHEQUE',
  CARD = 'CARD',
  NET_BANKING = 'NET_BANKING',
  OTHER = 'OTHER',
}

export enum InvoiceDocumentType {
  INVOICE = 'INVOICE',
  RECEIPT = 'RECEIPT',
}
