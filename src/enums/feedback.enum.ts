export enum FeedbackFormStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
}

export enum FeedbackAudience {
  RESIDENTS = 'RESIDENTS',
  EMPLOYEES = 'EMPLOYEES',
  BOTH = 'BOTH',
}

export enum FeedbackAnswerType {
  PARAGRAPH = 'PARAGRAPH',
  SINGLE_CHOICE = 'SINGLE_CHOICE',
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE',
  RATING = 'RATING',
}

export enum FeedbackRecipientType {
  RESIDENT = 'RESIDENT',
  EMPLOYEE = 'EMPLOYEE',
}

export enum FeedbackRecipientStatus {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
}
