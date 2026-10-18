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

export enum NotificationAppSurface {
  WEB_APP = 'WEB_APP',
  MOBILE_L1 = 'MOBILE_L1',
  MOBILE_L3 = 'MOBILE_L3',
}

export enum NotificationDevicePlatform {
  WEB = 'WEB',
  ANDROID = 'ANDROID',
  IOS = 'IOS',
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
  GATE = 'GATE',
  AMENITIES = 'AMENITIES',
}
