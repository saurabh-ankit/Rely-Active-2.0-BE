export enum NotificationActorType {
  USER = 'USER',
  RESIDENT = 'RESIDENT',
  FAMILY_MEMBER = 'FAMILY_MEMBER',
  SYSTEM = 'SYSTEM',
}

export enum NotificationRecipientType {
  USER = 'USER',
  RESIDENT = 'RESIDENT',
  FAMILY_MEMBER = 'FAMILY_MEMBER',
}

export enum NotificationChannel {
  IN_APP = 'IN_APP',
}

export enum NotificationStatus {
  UNREAD = 'UNREAD',
  READ = 'READ',
  ARCHIVED = 'ARCHIVED',
}

export enum NotificationActionType {
  OPEN_ENTITY = 'OPEN_ENTITY',
  OPEN_URL = 'OPEN_URL',
  NONE = 'NONE',
}

export enum NotificationSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export enum NotificationModule {
  TICKETS = 'TICKETS',
}
