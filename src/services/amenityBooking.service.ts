import { Op, type Transaction, type WhereOptions } from 'sequelize'
import { HttpError } from '../middlewares/error/http-error.js'
import {
  AmenitySlotBlock,
  AmenitySlotBooking,
  type AmenitySlotConfig,
  type PropertyAmenity,
  Resident,
  ResidentFamilyMember,
} from '../models/index.js'
import { AmenityBookingStatus, type AmenitySlotBookingAttributes } from '../models/amenitySlotBooking.model.js'
import { AmenityBookingUnit, type AmenityBookingUnitType } from '../models/amenitySlotConfig.model.js'
import {
  formatMinutesToAmPm,
  generateSlotStartMinutes,
  isPastSlot,
  normalizeDaysOfWeek,
  ymdToDayOfWeekMon0,
} from '../utils/amenitySlot.util.js'
import { addDaysYmd, parseTimeToMinutes } from '../utils/roster.util.js'
import { bookingChargeFor } from './amenityBookingCharge.js'

const MINUTES_PER_DAY = 24 * 60
/** Longest day / stay booking, in days or nights. */
export const MAX_BOOKING_UNITS = 31

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const unitOf = (config: Pick<AmenitySlotConfig, 'bookingUnit'>): AmenityBookingUnitType =>
  config.bookingUnit || AmenityBookingUnit.SLOT

/** "slot" / "day" / "night", pluralised for a count. */
export const unitNoun = (unit: AmenityBookingUnitType, count = 1): string => {
  const noun = unit === AmenityBookingUnit.NIGHT ? 'night' : unit === AmenityBookingUnit.FULL_DAY ? 'day' : 'slot'
  return count === 1 ? noun : `${noun}s`
}

/** "11:59 PM" for the end of the day, which formatMinutesToAmPm can't show. */
export const formatTimeLabel = (minutes: number): string =>
  minutes >= MINUTES_PER_DAY ? '11:59 PM' : formatMinutesToAmPm(minutes)

/** When a slot ends: start + length, or the check-out time (next day) for a stay. */
export const slotEndMinutes = (config: AmenitySlotConfig, startMinutes: number): number =>
  unitOf(config) === AmenityBookingUnit.NIGHT
    ? (config.checkOutMinutes ?? startMinutes)
    : startMinutes + config.durationMin

export const slotEndLabel = (config: AmenitySlotConfig, startMinutes: number): string => {
  const label = formatTimeLabel(slotEndMinutes(config, startMinutes))
  return unitOf(config) === AmenityBookingUnit.NIGHT ? `${label} (next day)` : label
}

/** Every date from `from` to `to`, inclusive. */
export const datesBetween = (from: string, to: string): string[] => {
  const dates: string[] = []
  for (let d = from; d <= to; d = addDaysYmd(d, 1)) dates.push(d)
  return dates
}

export const bookingLastDate = (booking: Pick<AmenitySlotBookingAttributes, 'date' | 'endDate'>): string =>
  booking.endDate || booking.date

/** Bookings occupying any date in [from, to] (a stay occupies each of its nights' dates). */
export const occupyingWhere = (from: string, to: string): WhereOptions =>
  ({
    date: { [Op.lte]: to },
    [Op.or]: [{ endDate: { [Op.gte]: from } }, { endDate: null, date: { [Op.gte]: from } }],
  }) as WhereOptions

const prettyDate = (ymd: string): string => {
  const day = ymdToDayOfWeekMon0(ymd)
  return `${day === null ? '' : `${DAY_NAMES[day]} `}${ymd}`
}

export interface BookingRangeInput {
  date: string
  /** Timed slots only. */
  startMinutes?: number | null | undefined
  /** Full day: last day booked (inclusive). */
  endDate?: string | null | undefined
  /** Overnight stay: the check-out date. */
  checkOutDate?: string | null | undefined
}

export interface ResolvedBookingRange {
  unit: AmenityBookingUnitType
  date: string
  /** Last date occupied; null for a single date. */
  endDate: string | null
  startMinutes: number
  endMinutes: number
  unitCount: number
  /** Dates occupied (for a stay, the date each night starts). */
  dates: string[]
}

/** Works out what a booking request covers for this amenity's booking unit, or throws 400. */
export function resolveBookingRange(config: AmenitySlotConfig, input: BookingRangeInput): ResolvedBookingRange {
  const unit = unitOf(config)
  let lastDate = input.date
  let startMinutes = config.openMinutes

  if (unit === AmenityBookingUnit.SLOT) {
    const starts = generateSlotStartMinutes(config.openMinutes, config.closeMinutes, config.durationMin)
    if (input.startMinutes === undefined || input.startMinutes === null || !starts.includes(input.startMinutes)) {
      throw new HttpError(400, 'Invalid slot for this setup')
    }
    startMinutes = input.startMinutes
  } else if (unit === AmenityBookingUnit.FULL_DAY) {
    lastDate = input.endDate || input.date
    if (lastDate < input.date) throw new HttpError(400, 'The last day cannot be before the first day')
  } else {
    const checkOut = input.checkOutDate || input.endDate || addDaysYmd(input.date, 1)
    if (checkOut <= input.date) throw new HttpError(400, 'Check-out must be after the check-in date')
    lastDate = addDaysYmd(checkOut, -1)
  }

  const dates = datesBetween(input.date, lastDate)
  if (dates.length > MAX_BOOKING_UNITS) {
    throw new HttpError(400, `A booking can cover at most ${MAX_BOOKING_UNITS} ${unitNoun(unit, 2)}`)
  }

  const openDays = normalizeDaysOfWeek(config.daysOfWeek)
  const closed = dates.find((d) => {
    const day = ymdToDayOfWeekMon0(d)
    return day === null || !openDays.includes(day)
  })
  if (closed) throw new HttpError(400, `This amenity is closed on ${prettyDate(closed)}`)

  return {
    unit,
    date: input.date,
    endDate: dates.length > 1 ? lastDate : null,
    startMinutes,
    endMinutes: slotEndMinutes(config, startMinutes),
    unitCount: dates.length,
    dates,
  }
}

// ── Who a booking is for ────────────────────────────────────────────────────

/**
 * A booking belongs to one person: the resident (residentId set, familyMemberId null) or one of their
 * family members (familyMemberId set, residentId null). The database can't enforce this, so every
 * booking is created through a holder.
 */
export interface BookingHolder {
  residentId: string | null
  familyMemberId: string | null
}

export const residentHolder = (residentId: string): BookingHolder => ({ residentId, familyMemberId: null })
export const familyMemberHolder = (familyMemberId: string): BookingHolder => ({ residentId: null, familyMemberId })

export const isSameHolder = (
  booking: Pick<AmenitySlotBookingAttributes, 'residentId' | 'familyMemberId'>,
  holder: BookingHolder,
): boolean =>
  holder.familyMemberId
    ? booking.familyMemberId === holder.familyMemberId
    : !!holder.residentId && booking.residentId === holder.residentId && !booking.familyMemberId

/** Bookings held by a resident or any of the given family members (their household). */
export const householdBookingWhere = (residentId: string, familyMemberIds: string[]): WhereOptions =>
  familyMemberIds.length ? { [Op.or]: [{ residentId }, { familyMemberId: familyMemberIds }] } : { residentId }

/** Ids of a resident's family members (any, including deleted, so older bookings still match). */
export async function familyMemberIdsOf(residentId: string, transaction: Transaction | null = null): Promise<string[]> {
  const rows = await ResidentFamilyMember.findAll({ where: { residentId }, attributes: ['id'], transaction })
  return rows.map((r) => r.id)
}

export interface ResolvedHolder {
  holder: BookingHolder
  /** The household's resident: the booker, or the family member's resident. Their flat is billed. */
  resident: Resident
  familyMember: ResidentFamilyMember | null
  name: string
}

/**
 * Checks the person a booking is for: exactly one of residentId / familyMemberId, a resident at this
 * property, or a residing family member of one. Throws 400/404 otherwise.
 */
export async function resolveBookingHolder(params: {
  residentId?: string | null | undefined
  familyMemberId?: string | null | undefined
  locationId: string
  transaction?: Transaction | null
}): Promise<ResolvedHolder> {
  const { residentId, familyMemberId, locationId } = params
  const transaction = params.transaction ?? null
  if (!!residentId === !!familyMemberId) {
    throw new HttpError(400, 'Choose either a resident or a family member for the booking')
  }

  if (familyMemberId) {
    const familyMember = await ResidentFamilyMember.findOne({
      where: { id: familyMemberId, isDeleted: false },
      include: [{ model: Resident, as: 'resident', where: { locId: locationId, isDeleted: false }, required: true }],
      transaction,
    })
    if (!familyMember?.resident) throw new HttpError(404, 'Family member not found for this property')
    if (!familyMember.isResiding) throw new HttpError(400, 'Only residing family members can book amenities')
    return {
      holder: familyMemberHolder(familyMember.id),
      resident: familyMember.resident,
      familyMember,
      name: personName(familyMember, 'Family member'),
    }
  }

  const resident = await Resident.findOne({
    where: { id: residentId as string, locId: locationId, isDeleted: false },
    transaction,
  })
  if (!resident) throw new HttpError(404, 'Resident not found for this property')
  return { holder: residentHolder(resident.id), resident, familyMember: null, name: personName(resident, 'Resident') }
}

export const personName = (
  person: { firstName?: string | null; lastName?: string | null } | null | undefined,
  fallback: string,
): string => `${person?.firstName || ''} ${person?.lastName || ''}`.trim() || fallback

/** Throws 400/409 when the range has started, is blocked, is full, or the same person already holds it. */
export async function assertRangeAvailable(
  config: AmenitySlotConfig,
  range: ResolvedBookingRange,
  holder: BookingHolder,
  transaction: Transaction | null = null,
): Promise<void> {
  if (isPastSlot(range.date, range.startMinutes)) {
    throw new HttpError(400, `Cannot book a ${unitNoun(range.unit)} that has already started`)
  }
  const lastDate = range.endDate || range.date

  const blocked = await AmenitySlotBlock.findOne({
    where: {
      slotConfigId: config.id,
      date: { [Op.between]: [range.date, lastDate] },
      startMinutes: range.startMinutes,
      isDeleted: false,
    },
    order: [['date', 'ASC']],
    transaction,
  })
  if (blocked) throw new HttpError(409, `This amenity is blocked on ${prettyDate(blocked.date)}`)

  const existing = await AmenitySlotBooking.findAll({
    where: {
      slotConfigId: config.id,
      startMinutes: range.startMinutes,
      status: AmenityBookingStatus.BOOKED,
      isDeleted: false,
      ...occupyingWhere(range.date, lastDate),
    },
    transaction,
  })

  const taken = new Map<string, number>()
  for (const booking of existing) {
    const occupied = datesBetween(booking.date, bookingLastDate(booking)).filter((d) => range.dates.includes(d))
    if (occupied.length && isSameHolder(booking, holder)) {
      const who = holder.familyMemberId ? 'family member' : 'resident'
      throw new HttpError(409, `Already booked for this ${who} on ${prettyDate(occupied[0] as string)}`)
    }
    for (const d of occupied) taken.set(d, (taken.get(d) || 0) + 1)
  }
  const full = range.dates.find((d) => (taken.get(d) || 0) >= config.capacity)
  if (full) throw new HttpError(409, `Fully booked on ${prettyDate(full)}`)
}

/** Validates and saves a booking, capturing the amenity's current price for each slot, day or night. */
export async function createAmenityBooking(params: {
  propertyAmenity: PropertyAmenity
  config: AmenitySlotConfig
  holder: BookingHolder
  input: BookingRangeInput
  notes?: string | null | undefined
  userId: string | null
  transaction: Transaction
}): Promise<AmenitySlotBooking> {
  const { propertyAmenity, config, holder, input, notes, userId, transaction } = params
  if (!!holder.residentId === !!holder.familyMemberId) {
    throw new HttpError(400, 'A booking must be for either a resident or a family member')
  }
  const range = resolveBookingRange(config, input)
  await assertRangeAvailable(config, range, holder, transaction)

  const unitPrice = bookingChargeFor(propertyAmenity)
  return AmenitySlotBooking.create(
    {
      slotConfigId: config.id,
      date: range.date,
      endDate: range.endDate,
      startMinutes: range.startMinutes,
      endMinutes: range.endMinutes,
      unitCount: range.unitCount,
      unitPrice,
      chargeAmount: unitPrice === null ? null : Math.round(unitPrice * range.unitCount * 100) / 100,
      residentId: holder.familyMemberId ? null : holder.residentId,
      familyMemberId: holder.familyMemberId,
      status: AmenityBookingStatus.BOOKED,
      notes: notes?.trim() || null,
      createdBy: userId,
      updatedBy: userId,
    },
    { transaction },
  )
}

/** Booking fields shared by the web and mobile booking responses. */
export const bookingRangeView = (
  booking: Pick<
    AmenitySlotBookingAttributes,
    'date' | 'endDate' | 'startMinutes' | 'endMinutes' | 'unitCount' | 'unitPrice' | 'chargeAmount'
  >,
  config?: AmenitySlotConfig | null,
) => {
  const unit = config ? unitOf(config) : AmenityBookingUnit.SLOT
  const lastDate = bookingLastDate(booking)
  return {
    bookingUnit: unit,
    endDate: booking.endDate ?? null,
    /** Stays only: the morning the guest leaves. */
    checkOutDate: unit === AmenityBookingUnit.NIGHT ? addDaysYmd(lastDate, 1) : null,
    endMinutes: booking.endMinutes ?? null,
    endLabel: booking.endMinutes != null ? formatTimeLabel(booking.endMinutes) : null,
    unitCount: booking.unitCount ?? 1,
    unitPrice: booking.unitPrice != null ? Number(booking.unitPrice) : null,
    chargeAmount: booking.chargeAmount != null ? Number(booking.chargeAmount) : null,
  }
}

// ── Setup from the property's amenity settings ──────────────────────────────

export interface SlotSetupFromSettings {
  bookingUnit: AmenityBookingUnitType
  openMinutes: number
  closeMinutes: number
  durationMin: number
  checkOutMinutes: number | null
}

const readTime = (settings: Record<string, unknown>, key: string): number | null => {
  const raw = settings[key]
  return typeof raw === 'string' && raw.trim() ? parseTimeToMinutes(raw.trim()) : null
}

/** 23:59 as a closing time means the end of the day. */
const closingMinutes = (minutes: number | null): number | null =>
  minutes === null ? null : minutes >= MINUTES_PER_DAY - 1 ? MINUTES_PER_DAY : minutes

/**
 * The slot setup the property's amenity settings describe, or null when they don't name a booking
 * unit (older saves) or are incomplete.
 */
export function slotSetupFromSettings(settings: unknown): SlotSetupFromSettings | null {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null
  const s = settings as Record<string, unknown>
  const unit = s.bookingUnit as AmenityBookingUnitType | undefined

  if (unit === AmenityBookingUnit.NIGHT) {
    const checkIn = readTime(s, 'checkInTime')
    const checkOut = readTime(s, 'checkOutTime')
    if (checkIn === null || checkOut === null) return null
    // One "slot" a night, from check-in to midnight; the guest leaves at check-out the next day.
    return {
      bookingUnit: unit,
      openMinutes: checkIn,
      closeMinutes: MINUTES_PER_DAY,
      durationMin: MINUTES_PER_DAY - checkIn,
      checkOutMinutes: checkOut,
    }
  }

  const open = readTime(s, 'availableFrom')
  const close = closingMinutes(readTime(s, 'availableTo'))

  if (unit === AmenityBookingUnit.FULL_DAY) {
    const openMinutes = open ?? 0
    const closeMinutes = close ?? MINUTES_PER_DAY
    if (closeMinutes <= openMinutes) return null
    return {
      bookingUnit: unit,
      openMinutes,
      closeMinutes,
      durationMin: closeMinutes - openMinutes,
      checkOutMinutes: null,
    }
  }

  if (unit === AmenityBookingUnit.SLOT) {
    const duration = Number(s.slotDurationMinutes)
    if (open === null || close === null || close <= open || !Number.isInteger(duration) || duration <= 0) return null
    return { bookingUnit: unit, openMinutes: open, closeMinutes: close, durationMin: duration, checkOutMinutes: null }
  }
  return null
}

/** "Booked 10:00 AM", "Booked 3 days from 2026-10-30", "Booked 3 nights: check-in 2026-10-30 12:00 PM". */
export const bookedMessage = (
  booking: Pick<AmenitySlotBookingAttributes, 'date' | 'endDate' | 'startMinutes' | 'unitCount'>,
  config: AmenitySlotConfig,
): string => {
  const unit = unitOf(config)
  const count = booking.unitCount ?? 1
  if (unit === AmenityBookingUnit.SLOT) return `Booked ${formatMinutesToAmPm(booking.startMinutes)} successfully`
  if (unit === AmenityBookingUnit.FULL_DAY) return `Booked ${count} ${unitNoun(unit, count)} from ${booking.date}`
  const checkOut = addDaysYmd(bookingLastDate(booking), 1)
  return `Booked ${count} ${unitNoun(unit, count)}: check-in ${booking.date} ${formatMinutesToAmPm(
    booking.startMinutes,
  )}, check-out ${checkOut}`
}
