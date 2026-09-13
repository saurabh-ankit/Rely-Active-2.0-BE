import { ProrationPolicy } from '../../enums/billing.enum.js'

export interface ProrationCalculationInput {
  periodStart: string // 'YYYY-MM-DD'
  periodEnd: string // 'YYYY-MM-DD'
  subscriptionStart: string // 'YYYY-MM-DD'
  subscriptionEnd?: string | null // 'YYYY-MM-DD'
  pauseStart?: string | null // 'YYYY-MM-DD'
  pauseEnd?: string | null // 'YYYY-MM-DD'
  prorationPolicy: ProrationPolicy
  quantity: number
  unitPrice: number
}

export interface ProrationCalculationResult {
  activeDays: number
  totalPeriodDays: number
  prorationFactor: number // between 0.0 and 1.0
  proratedQuantity: number
  effectiveUnitPrice: number
  subtotal: number
}

/**
 * Parses YYYY-MM-DD into a UTC date (hours at midnight)
 */
function parseDateOnly(dateStr: string): Date {
  const parts = dateStr.split('-')
  const year = Number(parts[0] ?? 0)
  const month = Number(parts[1] ?? 1)
  const day = Number(parts[2] ?? 1)
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
}

/**
 * Calculates inclusive difference in days between two date strings (d2 - d1 + 1)
 */
function daysInclusive(d1: Date, d2: Date): number {
  if (d1.getTime() > d2.getTime()) return 0
  const diffMs = d2.getTime() - d1.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1
}

/**
 * Computes proration for a recurring charge within a specific billing window.
 */
export function calculateProration(input: ProrationCalculationInput): ProrationCalculationResult {
  const periodStart = parseDateOnly(input.periodStart)
  const periodEnd = parseDateOnly(input.periodEnd)

  const totalPeriodDays = daysInclusive(periodStart, periodEnd)
  if (totalPeriodDays <= 0) {
    throw new Error(`Invalid billing period: ${input.periodStart} to ${input.periodEnd}`)
  }

  const subStart = parseDateOnly(input.subscriptionStart)
  const subEnd = input.subscriptionEnd ? parseDateOnly(input.subscriptionEnd) : null

  // 1. Effective range is the intersection between [periodStart, periodEnd] and [subStart, subEnd]
  const effectiveStart = new Date(Math.max(periodStart.getTime(), subStart.getTime()))
  const effectiveEnd = subEnd
    ? new Date(Math.min(periodEnd.getTime(), subEnd.getTime()))
    : periodEnd

  if (effectiveStart.getTime() > effectiveEnd.getTime()) {
    return {
      activeDays: 0,
      totalPeriodDays,
      prorationFactor: 0,
      proratedQuantity: 0,
      effectiveUnitPrice: input.unitPrice,
      subtotal: 0,
    }
  }

  let activeDays = daysInclusive(effectiveStart, effectiveEnd)

  // 2. Subtract any overlapping paused days
  if (input.pauseStart) {
    const pauseStart = parseDateOnly(input.pauseStart)
    const pauseEnd = input.pauseEnd ? parseDateOnly(input.pauseEnd) : effectiveEnd

    const overlapStart = new Date(Math.max(effectiveStart.getTime(), pauseStart.getTime()))
    const overlapEnd = new Date(Math.min(effectiveEnd.getTime(), pauseEnd.getTime()))

    if (overlapStart.getTime() <= overlapEnd.getTime()) {
      const pausedDays = daysInclusive(overlapStart, overlapEnd)
      activeDays = Math.max(0, activeDays - pausedDays)
    }
  }

  if (activeDays <= 0) {
    return {
      activeDays: 0,
      totalPeriodDays,
      prorationFactor: 0,
      proratedQuantity: 0,
      effectiveUnitPrice: input.unitPrice,
      subtotal: 0,
    }
  }

  // 3. Compute factor based on policy
  let prorationFactor = 1.0

  if (input.prorationPolicy === ProrationPolicy.DAILY) {
    prorationFactor = activeDays / totalPeriodDays
  } else if (
    input.prorationPolicy === ProrationPolicy.FULL_MONTH ||
    input.prorationPolicy === ProrationPolicy.NO_PRORATION
  ) {
    prorationFactor = 1.0
  }

  const proratedQuantity = Number((input.quantity * prorationFactor).toFixed(3))
  const subtotal = Number((input.quantity * input.unitPrice * prorationFactor).toFixed(2))

  return {
    activeDays,
    totalPeriodDays,
    prorationFactor: Number(prorationFactor.toFixed(6)),
    proratedQuantity,
    effectiveUnitPrice: input.unitPrice,
    subtotal,
  }
}
