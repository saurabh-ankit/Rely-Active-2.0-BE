import { describe, expect, it } from 'vitest'
import { RECURRING_SERVICE_TYPES, ServiceType, USAGE_SERVICE_TYPES } from '../../enums/billing.enum.js'
import {
  daysInMonth,
  endOfMonth,
  financialYear,
  isFullCalendarMonth,
  localDay,
  localDayBounds,
  overlapRange,
  prorateMonthly,
} from '../../utils/billing/dates.js'
import { RECURRING_SOURCES } from './sources/recurring.sources.js'
import { USAGE_SOURCES } from './sources/usage.sources.js'

describe('prorateMonthly', () => {
  it('charges exactly the monthly price for any full calendar month', () => {
    for (const [from, to] of [
      ['2026-02-01', '2026-02-28'],
      ['2028-02-01', '2028-02-29'],
      ['2026-04-01', '2026-04-30'],
      ['2026-10-01', '2026-10-31'],
    ] as const) {
      expect(prorateMonthly(30000, from, to)).toBe(30000)
    }
  })

  it('prorates by the days of that month', () => {
    expect(prorateMonthly(31000, '2026-10-17', '2026-10-31')).toBe(15000) // 15 of 31 days
    expect(prorateMonthly(28000, '2026-02-15', '2026-02-28')).toBe(14000) // 14 of 28 days
    expect(prorateMonthly(29000, '2028-02-01', '2028-02-10')).toBe(10000) // leap year: 10 of 29
  })

  it('splits a range that crosses months', () => {
    // 15 of 31 days of Oct + 10 of 30 days of Nov
    expect(prorateMonthly(30000, '2026-10-17', '2026-11-10')).toBe(24516.13)
  })

  it('charges a single day', () => {
    expect(prorateMonthly(31000, '2026-10-05', '2026-10-05')).toBe(1000)
  })
})

describe('date helpers', () => {
  it('knows month lengths', () => {
    expect(daysInMonth('2026-02-10')).toBe(28)
    expect(daysInMonth('2028-02-10')).toBe(29)
    expect(endOfMonth('2026-09-03')).toBe('2026-09-30')
    expect(isFullCalendarMonth('2026-09-01', '2026-09-30')).toBe(true)
    expect(isFullCalendarMonth('2026-09-02', '2026-09-30')).toBe(false)
  })

  it('intersects ranges with open bounds', () => {
    expect(overlapRange('2026-10-01', '2026-10-31', '2026-10-17', null)).toEqual({
      from: '2026-10-17',
      to: '2026-10-31',
    })
    expect(overlapRange('2026-10-01', '2026-10-31', null, '2026-10-09')).toEqual({
      from: '2026-10-01',
      to: '2026-10-09',
    })
    expect(overlapRange('2026-10-01', '2026-10-31', '2026-11-01', null)).toBeNull()
  })

  it('uses the Indian financial year', () => {
    expect(financialYear('2026-03-31')).toBe('2025-26')
    expect(financialYear('2026-04-01')).toBe('2026-27')
  })

  it('reads DATETIME values in local (IST) days', () => {
    // 20:00 UTC on 31 Oct is 01:30 IST on 1 Nov
    expect(localDay(new Date('2026-10-31T20:00:00Z'))).toBe('2026-11-01')
    const [from, to] = localDayBounds('2026-11-01', '2026-11-30')
    expect(from.toISOString()).toBe('2026-10-31T18:30:00.000Z')
    expect(to.toISOString()).toBe('2026-11-30T18:29:59.999Z')
  })
})

describe('charge sources', () => {
  // Every chargeable service type must have a collector, or its charges silently never reach an invoice.
  it('covers every recurring service type', () => {
    expect(RECURRING_SOURCES.map((s) => s.serviceType).sort()).toEqual([...RECURRING_SERVICE_TYPES].sort())
  })

  it('covers every usage service type', () => {
    expect(USAGE_SOURCES.map((s) => s.serviceType).sort()).toEqual([...USAGE_SERVICE_TYPES].sort())
  })

  it('leaves only invoice-screen types without a collector', () => {
    const collected = new Set([...RECURRING_SOURCES, ...USAGE_SOURCES].map((s) => s.serviceType))
    const uncollected = Object.values(ServiceType).filter((t) => !collected.has(t))
    expect(uncollected.sort()).toEqual([ServiceType.CARRY_FORWARD, ServiceType.MISCELLANEOUS_AT_BILLING].sort())
  })

  it('adjusts packages but not rent', () => {
    const adjustable = RECURRING_SOURCES.filter((s) => s.adjustable).map((s) => s.serviceType)
    expect(adjustable.sort()).toEqual([ServiceType.CARE_PACKAGE, ServiceType.FOOD_PACKAGE].sort())
  })
})
