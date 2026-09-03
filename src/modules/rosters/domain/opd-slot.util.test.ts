import { describe, expect, it } from 'vitest'
import { calculateOpdSlotDefinitions } from './opd-slot.util.js'

describe('calculateOpdSlotDefinitions', () => {
  it('splits a time range into slots with buffer', () => {
    const slots = calculateOpdSlotDefinitions('2026-09-02', '09:00 - 10:00', 30, 0)
    expect(slots).toHaveLength(2)
    expect(slots[0]?.slotNumber).toBe(1)
    expect(slots[1]?.slotNumber).toBe(2)
  })

  it('returns empty array for invalid range', () => {
    expect(calculateOpdSlotDefinitions('2026-09-02', 'invalid', 30, 0)).toEqual([])
  })
})
