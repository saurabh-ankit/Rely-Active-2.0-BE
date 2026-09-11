/**
 * Monthly Billing Proration Utility
 * Accurately calculates prorated charges based on active days in the billing month
 * (handles 28, 29, 30, and 31-day months automatically).
 */

export interface MonthlyProrationInput {
  monthlyPrice: number
  startDate: string // YYYY-MM-DD
  endDate?: string | null // YYYY-MM-DD
  billingMonth: string // YYYY-MM
}

export interface MonthlyProrationOutput {
  billingPeriodStart: string
  billingPeriodEnd: string
  daysInMonth: number
  activeDays: number
  dailyRate: number
  unitPrice: number
  amount: number
  isProrated: boolean
}

export function calculateMonthlyProration(input: MonthlyProrationInput): MonthlyProrationOutput {
  const { monthlyPrice, startDate, endDate, billingMonth } = input

  // --------------------------------------------------
  // 1. Get year and month
  // --------------------------------------------------
  const parts = billingMonth.split('-')
  const year = Number(parts[0]) || 2026
  const month = Number(parts[1]) || 1

  // --------------------------------------------------
  // 2. Get number of days in billing month
  // (Passing month as 1-12 with day 0 gives last day of that month)
  // --------------------------------------------------
  const daysInMonth = new Date(year, month, 0).getDate()

  // --------------------------------------------------
  // 3. First and last date of billing month
  // --------------------------------------------------
  const monthStart = `${billingMonth}-01`
  const monthEnd = `${billingMonth}-${String(daysInMonth).padStart(2, '0')}`

  // --------------------------------------------------
  // 4. Determine actual billing period
  // --------------------------------------------------
  const cleanStartDate = (String(startDate || '').split('T')[0] || monthStart).trim()
  const rawEndDate = endDate ? String(endDate).split('T')[0] : null
  const cleanEndDate = rawEndDate && rawEndDate.trim().length > 0 ? rawEndDate.trim() : null

  // Guard: if subscription started after this month or ended before this month
  if (cleanStartDate > monthEnd || (cleanEndDate && cleanEndDate < monthStart)) {
    const dailyRate = daysInMonth > 0 ? monthlyPrice / daysInMonth : 0
    return {
      billingPeriodStart: cleanStartDate > monthEnd ? cleanStartDate : monthStart,
      billingPeriodEnd: cleanEndDate && cleanEndDate < monthStart ? cleanEndDate : monthEnd,
      daysInMonth,
      activeDays: 0,
      dailyRate: Number(dailyRate.toFixed(4)),
      unitPrice: monthlyPrice,
      amount: 0,
      isProrated: true,
    }
  }

  const billingPeriodStart = cleanStartDate > monthStart ? cleanStartDate : monthStart

  const billingPeriodEnd = cleanEndDate && cleanEndDate < monthEnd ? cleanEndDate : monthEnd

  // --------------------------------------------------
  // 5. Calculate active days INCLUDING start and end
  // --------------------------------------------------
  const start = new Date(`${billingPeriodStart}T00:00:00Z`)
  const end = new Date(`${billingPeriodEnd}T00:00:00Z`)

  const millisecondsPerDay = 24 * 60 * 60 * 1000

  const activeDays = Math.max(0, Math.floor((end.getTime() - start.getTime()) / millisecondsPerDay) + 1)

  // --------------------------------------------------
  // 6. Daily rate
  // --------------------------------------------------
  const dailyRate = daysInMonth > 0 ? monthlyPrice / daysInMonth : 0

  // --------------------------------------------------
  // 7. Calculate amount
  // --------------------------------------------------
  let amount = dailyRate * activeDays

  // Round to 2 decimal places
  amount = Math.round((amount + Number.EPSILON) * 100) / 100

  // --------------------------------------------------
  // 8. Check whether this is a full month
  // --------------------------------------------------
  const isProrated = billingPeriodStart !== monthStart || billingPeriodEnd !== monthEnd

  return {
    billingPeriodStart,
    billingPeriodEnd,
    daysInMonth,
    activeDays,
    dailyRate: Number(dailyRate.toFixed(4)),
    unitPrice: monthlyPrice,
    amount,
    isProrated,
  }
}
