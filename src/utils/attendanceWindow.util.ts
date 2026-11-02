import { Op } from 'sequelize'
import { VOID_INVOICE_STATUSES } from '../enums/billing.enum.js'
import { Invoice } from '../models/index.js'
import { addDays, todayDay } from './billing/dates.js'

/** Attendance staff can still mark (or correct) attendance this many days after the day itself. */
export const LATE_MARK_DAYS = 3

/** The earliest day (IST) whose attendance can still be marked. */
export const earliestMarkableDay = (): string => addDays(todayDay(), -LATE_MARK_DAYS)

export const LATE_WINDOW_MESSAGE = `Attendance can only be marked up to ${LATE_MARK_DAYS} days back.`

export const BILLED_MESSAGE = "This month is already billed for the flat, so this attendance can't be changed."

/** Whether the flat already has a bill (not cancelled) covering `day`: its charges can't change after the fact. */
export async function isFlatBilledOn(unitId: string | null | undefined, day: string): Promise<boolean> {
  if (!unitId) return false
  const count = await Invoice.count({
    where: {
      unitId,
      isDeleted: false,
      status: { [Op.notIn]: [...VOID_INVOICE_STATUSES] },
      startDate: { [Op.lte]: day },
      endDate: { [Op.gte]: day },
    },
  })
  return count > 0
}
