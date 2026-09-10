export enum ShiftEmployeeDateStatus {
  UPCOMING = 'upcoming',
  ON_DUTY = 'on_duty',
  COMPLETED = 'completed',
  ABSENT = 'absent',
  COVERED = 'covered',
  DAY_OFF = 'day_off',
}

export type LeaveType = 'week_off' | 'sick' | 'casual' | 'planned' | 'holiday'

export const LEAVE_TYPES: LeaveType[] = ['week_off', 'sick', 'casual', 'planned', 'holiday']

export type WeekDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

export const WEEK_DAYS: WeekDay[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export enum RosterAreaType {
  LOBBY = 'Lobby Area',
  SECURITY = 'Security Area',
  MAINTENANCE = 'Maintenance Area',
  KITCHEN = 'Kitchen Area',
  PARKING = 'Parking Area',
  OFFICE = 'Office Area',
  STORAGE = 'Storage Area',
  RECREATION = 'Recreation Area',
  MEDICAL = 'Medical Area',
  OTHERS = 'Others',
}

export enum RosterAreaStatus {
  ACTIVE = 'Active',
  INACTIVE = 'Inactive',
}

export enum SlotGenerationMode {
  AUTO_GENERATE = 'Auto Generate',
  MANUAL = 'Manual',
}
