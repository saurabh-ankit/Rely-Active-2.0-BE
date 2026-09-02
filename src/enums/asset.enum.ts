export enum AssetStatus {
  AVAILABLE = 'available',
  ASSIGNED = 'assigned',
  MAINTENANCE = 'maintenance',
  RETIRED = 'retired',
  DISPOSED = 'disposed',
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
