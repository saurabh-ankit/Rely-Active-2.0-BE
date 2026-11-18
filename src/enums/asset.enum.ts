export enum AssetStatus {
  AVAILABLE = 'available',
  ASSIGNED = 'assigned',
  MAINTENANCE = 'maintenance',
  RETIRED = 'retired',
  DISPOSED = 'disposed',
  SCRAP = 'scrap',
  REPAIR = 'repair',
  EXTERNAL_USE = 'external_use',
  PENDING_INSPECTION = 'pending_inspection',
  INTER_CENTER_OUTBOUND_PENDING = 'inter_center_outbound_pending',
  INTER_CENTER_INCOMING = 'inter_center_incoming',
  PENDING_TRANSFER_ACCEPTANCE = 'pending_transfer_acceptance',
  TRANSFER_REJECTED = 'transfer_rejected',
}

export enum AssetCondition {
  EXCELLENT = 'excellent',
  GOOD = 'good',
  FAIR = 'fair',
  POOR = 'poor',
}

export enum AssigneeType {
  EMPLOYEE = 'employee',
  RESIDENT = 'resident',
  FLAT = 'flat',
}

export enum ServiceType {
  REPAIR = 'repair',
  PREVENTIVE = 'preventive',
  INSPECTION = 'inspection',
  CLEANING = 'cleaning',
  UPGRADE = 'upgrade',
  SCRAP = 'scrap',
}

export enum WarrantyType {
  MANUFACTURER = 'manufacturer',
  EXTENDED = 'extended',
  SERVICE_CONTRACT = 'service_contract',
}

export enum CalibrationResult {
  PASS = 'pass',
  FAIL = 'fail',
}

export enum CertificationType {
  REGULATORY = 'regulatory',
  SAFETY = 'safety',
  QUALITY = 'quality',
  ENVIRONMENTAL = 'environmental',
}

export enum InspectionType {
  ROUTINE = 'routine',
  SAFETY = 'safety',
  REGULATORY = 'regulatory',
  QUALITY = 'quality',
}

export enum ComplianceStatus {
  VALID = 'valid',
  EXPIRED = 'expired',
  EXPIRING_SOON = 'expiring_soon',
  PENDING_RENEWAL = 'pending_renewal',
}

export enum ItemRequestReason {
  SCRAP = 'scrap',
  REPAIR = 'repair',
  EXTERNAL_USE = 'external_use',
  INTER_CENTER_TRANSFER = 'inter_center_transfer',
}

/** Condition reported when sending/receiving an inter-center transfer. */
export enum TransferSendCondition {
  NEW = 'new',
  GOOD = 'good',
  BAD = 'bad',
  PARTIALLY_DAMAGE = 'partially_damage',
}

export enum ItemRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DECLINED = 'declined',
  RETURNED = 'returned',
  RETURN_DECLINED = 'return_declined',
  /** Gate pass closed before outbound (e.g. asset marked available without leaving). */
  CANCELLED = 'cancelled',
}

/** Per-asset gate decision for outbound or return scan. */
export enum ItemRequestAssetGateStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DECLINED = 'declined',
}
