// ─────────────────────────────────────────────────────────────────────────────
// Rely Active 2.0 — Billing & Revenue Management Module
// Enum Definitions (v2.3 Final Architecture)
// ─────────────────────────────────────────────────────────────────────────────

// ── Occupancy / Ownership ─────────────────────────────────────────────────────

export enum UnitResidentRelationshipType {
  OWNER = 'OWNER',
  TENANT = 'TENANT',
  SPOUSE = 'SPOUSE',
  DEPENDENT = 'DEPENDENT',
  CO_RESIDENT = 'CO_RESIDENT',
  CARETAKER = 'CARETAKER',
}

// ── Billing Account ───────────────────────────────────────────────────────────

export enum BillingMode {
  INDIVIDUAL = 'INDIVIDUAL',
  UNIT_CONSOLIDATED = 'UNIT_CONSOLIDATED',
}

export enum BillingAccountStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  CLOSED = 'CLOSED',
}

export enum BillingCycle {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  ANNUAL = 'ANNUAL',
}

// ── Billing Parties ───────────────────────────────────────────────────────────

export enum BillingPartyType {
  RESIDENT = 'RESIDENT',
  FAMILY_MEMBER = 'FAMILY_MEMBER',
  GUARDIAN = 'GUARDIAN',
  ORGANIZATION = 'ORGANIZATION',
  OTHER = 'OTHER',
}

export enum BillingPartyRole {
  PRIMARY_PAYER = 'PRIMARY_PAYER',
  SECONDARY_PAYER = 'SECONDARY_PAYER',
  AUTHORIZED_CONTACT = 'AUTHORIZED_CONTACT',
}

// ── Product Catalog ───────────────────────────────────────────────────────────

export enum BillingProductCategory {
  ACCOMMODATION = 'ACCOMMODATION',
  FOOD = 'FOOD',
  CARE = 'CARE',
  HOUSEKEEPING = 'HOUSEKEEPING',
  TRANSPORT = 'TRANSPORT',
  ACTIVITY = 'ACTIVITY',
  UTILITY = 'UTILITY',
  CONSUMABLE = 'CONSUMABLE',
  GUEST_SERVICE = 'GUEST_SERVICE',
  SECURITY_DEPOSIT = 'SECURITY_DEPOSIT',
  ONE_TIME = 'ONE_TIME',
  OTHER = 'OTHER',
}

export enum ChargeType {
  SUBSCRIPTION = 'SUBSCRIPTION',
  USAGE = 'USAGE',
  ONE_TIME = 'ONE_TIME',
}

// ── Contracts ─────────────────────────────────────────────────────────────────

export enum ContractType {
  STANDARD = 'STANDARD',
  TRIAL = 'TRIAL',
  CONCESSION = 'CONCESSION',
}

export enum ContractStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  TERMINATED = 'TERMINATED',
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

export enum ProrationPolicy {
  DAILY = 'DAILY',
  FULL_MONTH = 'FULL_MONTH',
  NO_PRORATION = 'NO_PRORATION',
}

// ── Billing Events ────────────────────────────────────────────────────────────

export enum BillingEventSourceModule {
  FNB = 'FNB',
  CARE = 'CARE',
  TRANSPORT = 'TRANSPORT',
  ACTIVITY = 'ACTIVITY',
  INVENTORY = 'INVENTORY',
  HOUSEKEEPING = 'HOUSEKEEPING',
  MANUAL = 'MANUAL',
  SYSTEM = 'SYSTEM',
}

export enum BillingEventStatus {
  PENDING = 'PENDING',
  INVOICED = 'INVOICED',
  CANCELLED = 'CANCELLED',
}

// ── Invoices ──────────────────────────────────────────────────────────────────

export enum InvoiceType {
  INVOICE = 'INVOICE',
  CREDIT_NOTE = 'CREDIT_NOTE',
  DEBIT_NOTE = 'DEBIT_NOTE',
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  PREVIEW = 'PREVIEW',
  FINALIZED = 'FINALIZED',
  SENT = 'SENT',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  OVERDUE = 'OVERDUE',
}

export enum InvoiceLineType {
  SUBSCRIPTION = 'SUBSCRIPTION',
  USAGE = 'USAGE',
  DISCOUNT = 'DISCOUNT',
  TAX = 'TAX',
  ADJUSTMENT = 'ADJUSTMENT',
}

// ── Payments ──────────────────────────────────────────────────────────────────

export enum PaymentMethod {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CHEQUE = 'CHEQUE',
  UPI = 'UPI',
  NEFT = 'NEFT',
  RTGS = 'RTGS',
  CARD = 'CARD',
  OTHER = 'OTHER',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED',
}

// ── Billing Runs ──────────────────────────────────────────────────────────────

export enum BillingRunType {
  SCHEDULED = 'SCHEDULED',
  MANUAL = 'MANUAL',
  PREVIEW = 'PREVIEW',
}

export enum BillingRunStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

// ── Ledger ────────────────────────────────────────────────────────────────────

export enum LedgerEntryType {
  INVOICE = 'INVOICE',
  PAYMENT = 'PAYMENT',
  CREDIT_NOTE = 'CREDIT_NOTE',
  DEBIT_NOTE = 'DEBIT_NOTE',
  CREDIT_APPLIED = 'CREDIT_APPLIED',
  REFUND = 'REFUND',
}
