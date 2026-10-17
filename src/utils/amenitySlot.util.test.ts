import { describe, expect, it } from 'vitest'
import {
  classifySlotPeriod,
  formatMinutesToAmPm,
  generateSlotStartMinutes,
  isPastSlot,
  normalizeDaysOfWeek,
} from './amenitySlot.util.js'

describe('amenitySlot.util', () => {
  it('generates slots that fit fully before close time', () => {
    expect(generateSlotStartMinutes(7 * 60, 10 * 60, 60)).toEqual([420, 480, 540])
    expect(generateSlotStartMinutes(7 * 60, 10 * 60 + 30, 60)).toEqual([420, 480, 540])
  })

  it('normalizes open days with dedupe and sort', () => {
    expect(normalizeDaysOfWeek([6, 1, 1, 3, 0, 7, -1])).toEqual([0, 1, 3, 6])
  })

  it('classifies slot period by start minute', () => {
    expect(classifySlotPeriod(11 * 60 + 59)).toBe('MORNING')
    expect(classifySlotPeriod(12 * 60)).toBe('AFTERNOON')
    expect(classifySlotPeriod(17 * 60)).toBe('EVENING')
  })

  it('formats minutes to am/pm', () => {
    expect(formatMinutesToAmPm(0)).toBe('12:00 AM')
    expect(formatMinutesToAmPm(13 * 60 + 5)).toBe('1:05 PM')
  })

  it('marks slots as past only when date/time has passed', () => {
    const now = new Date('2026-10-17T10:30:00')
    expect(isPastSlot('2026-10-16', 600, now)).toBe(true)
    expect(isPastSlot('2026-10-18', 600, now)).toBe(false)
    expect(isPastSlot('2026-10-17', 10 * 60, now)).toBe(true)
    expect(isPastSlot('2026-10-17', 11 * 60, now)).toBe(false)
  })
})
