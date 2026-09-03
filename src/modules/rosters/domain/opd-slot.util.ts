export interface OpdSlotDefinition {
  slotNumber: number
  scheduledStart: Date
  scheduledEnd: Date
}

export function calculateOpdSlotDefinitions(
  assignmentDate: string,
  slotTimeRange: string,
  slotDurationMinutes: number,
  bufferMinutes = 0,
): OpdSlotDefinition[] {
  if (!slotTimeRange || !slotTimeRange.includes('-')) return []

  const [startStr, endStr] = slotTimeRange.split('-').map((s) => s.trim())
  const parseTime = (value: string): number | null => {
    const [hours, minutes = '0'] = value.split(':')
    const h = Number(hours)
    const m = Number(minutes)
    if (Number.isNaN(h) || Number.isNaN(m)) return null
    return h * 60 + m
  }

  const startMins = parseTime(startStr || '')
  const endMins = parseTime(endStr || '')
  if (startMins === null || endMins === null || slotDurationMinutes <= 0) return []

  const endTotal = endMins <= startMins ? endMins + 24 * 60 : endMins
  const slots: OpdSlotDefinition[] = []
  let current = startMins
  let slotNumber = 1

  while (current + slotDurationMinutes <= endTotal) {
    const slotStartMins = current
    const slotEndMins = current + slotDurationMinutes

    const toDate = (totalMins: number) => {
      const h = Math.floor((totalMins % (24 * 60)) / 60)
      const m = totalMins % 60
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
      return new Date(`${assignmentDate}T${timeStr}.000Z`)
    }

    let scheduledEnd = toDate(slotEndMins)
    const scheduledStart = toDate(slotStartMins)
    if (scheduledEnd <= scheduledStart) {
      scheduledEnd = new Date(scheduledEnd.getTime() + 24 * 3600 * 1000)
    }

    slots.push({ slotNumber, scheduledStart, scheduledEnd })
    slotNumber++
    current = slotEndMins + bufferMinutes
  }

  return slots
}
