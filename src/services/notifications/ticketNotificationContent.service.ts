interface TatSnapshot {
  option?: string | null
  deadline?: Date | string | null
}

interface BuildTatUpdatedNotificationInput {
  ticketTitle?: string | null
  ticketNumber?: string | null
  updatedByName?: string | null
  previousTat: TatSnapshot
  updatedTat: TatSnapshot
  note?: string | null
}

export interface TatUpdatedNotificationContent {
  title: string
  message: string
  payload: Record<string, unknown>
}

function formatTatDateLabel(value?: Date | string | null): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTatSummary(option?: string | null, deadline?: Date | string | null): string {
  const safeOption = option && option.trim() ? option.trim() : 'Not set'
  const deadlineLabel = formatTatDateLabel(deadline)
  return deadlineLabel ? `${safeOption} (deadline: ${deadlineLabel})` : safeOption
}

export function buildTatUpdatedNotificationContent(
  input: BuildTatUpdatedNotificationInput,
): TatUpdatedNotificationContent {
  const safeTicketTitle = input.ticketTitle && input.ticketTitle.trim() ? input.ticketTitle.trim() : 'Ticket'
  const safeTicketNumber = input.ticketNumber && input.ticketNumber.trim() ? input.ticketNumber.trim() : 'N/A'
  const safeUpdatedBy = input.updatedByName && input.updatedByName.trim() ? input.updatedByName.trim() : 'System'
  const note = input.note && input.note.trim() ? input.note.trim() : null

  const previousTatSummary = formatTatSummary(input.previousTat.option, input.previousTat.deadline)
  const updatedTatSummary = formatTatSummary(input.updatedTat.option, input.updatedTat.deadline)

  const noteSegment = note ? ` Note: ${note}.` : ''
  const message =
    `Ticket TAT updated for ${safeTicketTitle} (${safeTicketNumber}). ` +
    `Action: ${safeUpdatedBy} changed TAT from ${previousTatSummary} to ${updatedTatSummary}.${noteSegment}`

  return {
    title: 'Ticket TAT updated',
    message,
    payload: {
      action: 'TICKET_TAT_UPDATED',
      actionLabel: 'Ticket TAT updated',
      updatedByName: safeUpdatedBy,
      previousTatOption: input.previousTat.option || null,
      previousTatDeadline: input.previousTat.deadline || null,
      updatedTatOption: input.updatedTat.option || null,
      updatedTatDeadline: input.updatedTat.deadline || null,
      previousTatSummary,
      updatedTatSummary,
      note,
    },
  }
}
