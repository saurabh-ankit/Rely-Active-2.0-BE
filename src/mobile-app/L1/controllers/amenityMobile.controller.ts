import type { Response } from 'express'
import { Op } from 'sequelize'
import sequelize from '../../../config/db/index.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import {
  Amenity,
  AmenitySlotBlock,
  AmenitySlotBooking,
  AmenitySlotConfig,
  PropertyAmenity,
  Resident,
} from '../../../models/index.js'
import { AmenityBookingStatus } from '../../../models/amenitySlotBooking.model.js'
import {
  SLOT_STATUSES,
  type SlotStatus,
  classifySlotPeriod,
  formatMinutesToAmPm,
  generateSlotStartMinutes,
  isPastSlot,
  normalizeDaysOfWeek,
  toYmdLocal,
  ymdToDayOfWeekMon0,
} from '../../../utils/amenitySlot.util.js'

interface ResidentContext {
  residentId: string
  locationId: string
}

type PropertyAmenityWithConfig = PropertyAmenity & {
  amenity?: Amenity | null
  slotConfig?: AmenitySlotConfig | null
}

const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/

const sendError = (res: Response, message: string, status = 400) => res.status(status).json({ success: false, message })

const normalizeYmd = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return YMD_REGEX.test(trimmed) ? trimmed : null
}

const normalizeQueryString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

const readSettings = (
  settings: unknown,
): {
  availableFrom: string | null
  availableTo: string | null
  slotDurationMinutes: number | null
} => {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return { availableFrom: null, availableTo: null, slotDurationMinutes: null }
  }
  const source = settings as Record<string, unknown>
  const availableFrom = typeof source.availableFrom === 'string' ? source.availableFrom.trim() || null : null
  const availableTo = typeof source.availableTo === 'string' ? source.availableTo.trim() || null : null
  const durationRaw = source.slotDurationMinutes
  const slotDurationMinutes =
    durationRaw === null || durationRaw === undefined || durationRaw === ''
      ? null
      : Number.isFinite(Number(durationRaw))
        ? Number(durationRaw)
        : null

  return {
    availableFrom,
    availableTo,
    slotDurationMinutes,
  }
}

const getConfigSummary = (config: {
  openMinutes: number
  closeMinutes: number
  durationMin: number
  capacity: number
  daysOfWeek: number[]
}) => {
  const slotsPerDay = generateSlotStartMinutes(config.openMinutes, config.closeMinutes, config.durationMin).length
  return {
    slotsPerDay,
    openLabel: formatMinutesToAmPm(config.openMinutes),
    closeLabel: formatMinutesToAmPm(config.closeMinutes),
    durationLabel: `${config.durationMin} min`,
    capacityLabel: `${config.capacity}`,
  }
}

const loadResidentContext = async (req: AuthenticatedRequest): Promise<ResidentContext | null> => {
  const residentId = req.user?.residentId || (req.user?.roles?.includes('RESIDENT') ? req.user?.id : null)
  if (!residentId) return null

  const locationId =
    normalizeQueryString(req.query.locationId) ||
    normalizeQueryString(req.query.locId) ||
    req.user?.defaultLocationId ||
    req.locationId ||
    null

  if (locationId) return { residentId, locationId }

  const resident = await Resident.findOne({
    where: { id: residentId, isDeleted: false },
    attributes: ['id', 'locId'],
  })
  if (!resident?.locId) return null

  return { residentId, locationId: resident.locId }
}

const loadAmenityContext = async (locationId: string, amenityId: string): Promise<PropertyAmenityWithConfig | null> => {
  return (await PropertyAmenity.findOne({
    where: {
      propertyId: locationId,
      amenityId,
      slotBookable: true,
      isDeleted: false,
      isActive: true,
    },
    include: [
      {
        model: Amenity,
        as: 'amenity',
        where: { isDeleted: false, isActive: true },
        required: true,
      },
      {
        model: AmenitySlotConfig,
        as: 'slotConfig',
        where: { isDeleted: false, isActive: true },
        required: false,
      },
    ],
  })) as PropertyAmenityWithConfig | null
}

const resolveAuditUserId = (req: AuthenticatedRequest): string | null => {
  if (req.user?.residentId || req.user?.familyMemberId) return null
  return req.user?.id || null
}

export const listResidentAmenities = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ctx = await loadResidentContext(req)
    if (!ctx) return sendError(res, 'Unable to resolve resident context', 401)

    const rows = (await PropertyAmenity.findAll({
      where: {
        propertyId: ctx.locationId,
        isDeleted: false,
        isActive: true,
      },
      include: [
        {
          model: Amenity,
          as: 'amenity',
          where: { isDeleted: false, isActive: true },
          required: true,
        },
        {
          model: AmenitySlotConfig,
          as: 'slotConfig',
          where: { isDeleted: false, isActive: true },
          required: false,
        },
      ],
      order: [[{ model: Amenity, as: 'amenity' }, 'name', 'ASC']],
    })) as PropertyAmenityWithConfig[]

    const amenities = rows.map((row) => {
      const settings = readSettings(row.settings)
      const config = row.slotConfig
      return {
        amenityId: row.amenityId,
        name: row.amenity?.name || 'Amenity',
        description: row.amenity?.description || null,
        slotBookable: Boolean(row.slotBookable),
        availableFrom: settings.availableFrom,
        availableTo: settings.availableTo,
        slotDurationMinutes: settings.slotDurationMinutes,
        hasSetup: Boolean(row.slotBookable && config),
        config:
          row.slotBookable && config
            ? {
                id: config.id,
                openMinutes: config.openMinutes,
                closeMinutes: config.closeMinutes,
                durationMin: config.durationMin,
                capacity: config.capacity,
                daysOfWeek: normalizeDaysOfWeek(config.daysOfWeek),
              }
            : null,
        summary:
          row.slotBookable && config
            ? getConfigSummary({
                openMinutes: config.openMinutes,
                closeMinutes: config.closeMinutes,
                durationMin: config.durationMin,
                capacity: config.capacity,
                daysOfWeek: normalizeDaysOfWeek(config.daysOfWeek),
              })
            : null,
      }
    })

    return res.status(200).json({
      success: true,
      message: 'Amenities retrieved successfully',
      data: { amenities },
    })
  } catch (error) {
    console.error('List Resident Amenities Error:', error)
    return sendError(res, 'Failed to load amenities', 500)
  }
}

export const getResidentAmenitySlotsByDate = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ctx = await loadResidentContext(req)
    if (!ctx) return sendError(res, 'Unable to resolve resident context', 401)

    const amenityId = String(req.params.amenityId || '').trim()
    const date = normalizeYmd(req.query.date)
    if (!amenityId) return sendError(res, 'Amenity id is required', 400)
    if (!date) return sendError(res, 'date must be in YYYY-MM-DD format', 400)

    const context = await loadAmenityContext(ctx.locationId, amenityId)
    if (!context) return sendError(res, 'Amenity not found for this location', 404)

    const config = context.slotConfig
    if (!config) {
      return res.status(200).json({
        success: true,
        message: 'Slots retrieved successfully',
        data: {
          date,
          hasSetup: false,
          dayClosed: false,
          slots: [],
        },
      })
    }

    const days = normalizeDaysOfWeek(config.daysOfWeek)
    const day = ymdToDayOfWeekMon0(date)
    const dayClosed = day === null ? true : !days.includes(day)
    const generatedStarts = dayClosed
      ? []
      : generateSlotStartMinutes(config.openMinutes, config.closeMinutes, config.durationMin)

    const bookings = await AmenitySlotBooking.findAll({
      where: {
        slotConfigId: config.id,
        date,
        status: AmenityBookingStatus.BOOKED,
        isDeleted: false,
      },
      order: [['createdAt', 'ASC']],
    })

    const blocks = await AmenitySlotBlock.findAll({
      where: {
        slotConfigId: config.id,
        date,
        isDeleted: false,
      },
    })

    const bookingsByStart = new Map<number, AmenitySlotBooking[]>()
    for (const booking of bookings) {
      const bucket = bookingsByStart.get(booking.startMinutes) || []
      bucket.push(booking)
      bookingsByStart.set(booking.startMinutes, bucket)
    }

    const blockByStart = new Map<number, AmenitySlotBlock>()
    for (const block of blocks) {
      blockByStart.set(block.startMinutes, block)
    }

    const slots = generatedStarts.map((startMinutes) => {
      const slotBookings = bookingsByStart.get(startMinutes) || []
      const blocked = blockByStart.get(startMinutes)
      const bookedCount = slotBookings.length
      const remainingCount = Math.max(config.capacity - bookedCount, 0)
      const past = isPastSlot(date, startMinutes)
      const myBooking = slotBookings.find((booking) => booking.residentId === ctx.residentId) || null

      let status: SlotStatus = SLOT_STATUSES.AVAILABLE
      if (past) status = SLOT_STATUSES.PAST
      else if (blocked) status = SLOT_STATUSES.BLOCKED
      else if (bookedCount >= config.capacity) status = SLOT_STATUSES.BOOKED
      else if (bookedCount > 0) status = SLOT_STATUSES.PARTIALLY_BOOKED

      return {
        startMinutes,
        startLabel: formatMinutesToAmPm(startMinutes),
        endMinutes: startMinutes + config.durationMin,
        endLabel: formatMinutesToAmPm(startMinutes + config.durationMin),
        period: classifySlotPeriod(startMinutes),
        status,
        capacity: config.capacity,
        bookedCount,
        remainingCount,
        isPast: past,
        isBlocked: Boolean(blocked),
        myBookingId: myBooking?.id || null,
        myBooked: Boolean(myBooking),
      }
    })

    const generatedSet = new Set(generatedStarts)
    const legacyByStart = new Map<number, AmenitySlotBooking[]>()
    for (const booking of bookings) {
      if (generatedSet.has(booking.startMinutes)) continue
      const bucket = legacyByStart.get(booking.startMinutes) || []
      bucket.push(booking)
      legacyByStart.set(booking.startMinutes, bucket)
    }

    const legacySlots = Array.from(legacyByStart.entries()).map(([startMinutes, slotBookings]) => {
      const myBooking = slotBookings.find((booking) => booking.residentId === ctx.residentId) || null
      return {
        startMinutes,
        startLabel: formatMinutesToAmPm(startMinutes),
        endMinutes: startMinutes + config.durationMin,
        endLabel: formatMinutesToAmPm(startMinutes + config.durationMin),
        period: classifySlotPeriod(startMinutes),
        status: SLOT_STATUSES.LEGACY_BOOKED,
        capacity: config.capacity,
        bookedCount: slotBookings.length,
        remainingCount: 0,
        isPast: isPastSlot(date, startMinutes),
        isBlocked: false,
        myBookingId: myBooking?.id || null,
        myBooked: Boolean(myBooking),
        isLegacy: true,
      }
    })

    return res.status(200).json({
      success: true,
      message: 'Slots retrieved successfully',
      data: {
        date,
        amenityId,
        amenityName: context.amenity?.name || 'Amenity',
        hasSetup: true,
        dayClosed,
        config: {
          id: config.id,
          openMinutes: config.openMinutes,
          closeMinutes: config.closeMinutes,
          durationMin: config.durationMin,
          capacity: config.capacity,
          daysOfWeek: days,
        },
        slots: [...slots, ...legacySlots].sort((a, b) => a.startMinutes - b.startMinutes),
      },
    })
  } catch (error) {
    console.error('Get Resident Amenity Slots Error:', error)
    return sendError(res, 'Failed to load slots', 500)
  }
}

export const createResidentAmenityBooking = async (req: AuthenticatedRequest, res: Response) => {
  const transaction = await sequelize.transaction()
  try {
    const ctx = await loadResidentContext(req)
    if (!ctx) {
      await transaction.rollback()
      return sendError(res, 'Unable to resolve resident context', 401)
    }

    const amenityId = String(req.params.amenityId || '').trim()
    const date = normalizeYmd(req.body?.date)
    const startMinutes = Number(req.body?.startMinutes)
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : ''

    if (!amenityId) {
      await transaction.rollback()
      return sendError(res, 'Amenity id is required', 400)
    }
    if (!date) {
      await transaction.rollback()
      return sendError(res, 'date must be in YYYY-MM-DD format', 400)
    }
    if (!Number.isInteger(startMinutes) || startMinutes < 0 || startMinutes > 1439) {
      await transaction.rollback()
      return sendError(res, 'Valid startMinutes is required', 400)
    }

    const context = await loadAmenityContext(ctx.locationId, amenityId)
    if (!context) {
      await transaction.rollback()
      return sendError(res, 'Amenity not found for this location', 404)
    }
    if (!context.slotConfig) {
      await transaction.rollback()
      return sendError(res, 'Slot setup not found for this amenity', 400)
    }

    const config = context.slotConfig
    const day = ymdToDayOfWeekMon0(date)
    const days = normalizeDaysOfWeek(config.daysOfWeek)
    if (day === null || !days.includes(day)) {
      await transaction.rollback()
      return sendError(res, 'This amenity is closed on the selected day', 400)
    }

    const starts = generateSlotStartMinutes(config.openMinutes, config.closeMinutes, config.durationMin)
    if (!starts.includes(startMinutes)) {
      await transaction.rollback()
      return sendError(res, 'Invalid slot for this setup', 400)
    }
    if (isPastSlot(date, startMinutes)) {
      await transaction.rollback()
      return sendError(res, 'Cannot book a past slot', 400)
    }

    const resident = await Resident.findOne({
      where: {
        id: ctx.residentId,
        locId: ctx.locationId,
        isDeleted: false,
      },
      transaction,
    })
    if (!resident) {
      await transaction.rollback()
      return sendError(res, 'Resident not found for this location', 404)
    }

    const blocked = await AmenitySlotBlock.findOne({
      where: {
        slotConfigId: config.id,
        date,
        startMinutes,
        isDeleted: false,
      },
      transaction,
    })
    if (blocked) {
      await transaction.rollback()
      return sendError(res, 'This slot is blocked', 409)
    }

    const existingResidentBooking = await AmenitySlotBooking.findOne({
      where: {
        slotConfigId: config.id,
        date,
        startMinutes,
        residentId: ctx.residentId,
        status: AmenityBookingStatus.BOOKED,
        isDeleted: false,
      },
      transaction,
    })
    if (existingResidentBooking) {
      await transaction.rollback()
      return sendError(res, 'You already have this slot booked', 409)
    }

    const slotBookingCount = await AmenitySlotBooking.count({
      where: {
        slotConfigId: config.id,
        date,
        startMinutes,
        status: AmenityBookingStatus.BOOKED,
        isDeleted: false,
      },
      transaction,
    })
    if (slotBookingCount >= config.capacity) {
      await transaction.rollback()
      return sendError(res, 'This slot is already full', 409)
    }

    const auditUserId = resolveAuditUserId(req)

    const booking = await AmenitySlotBooking.create(
      {
        slotConfigId: config.id,
        date,
        startMinutes,
        residentId: ctx.residentId,
        status: AmenityBookingStatus.BOOKED,
        notes: notes || null,
        createdBy: auditUserId,
        updatedBy: auditUserId,
      },
      { transaction },
    )

    await transaction.commit()

    return res.status(201).json({
      success: true,
      message: `Booked ${formatMinutesToAmPm(startMinutes)} successfully`,
      data: {
        booking: {
          id: booking.id,
          amenityId,
          amenityName: context.amenity?.name || 'Amenity',
          date: booking.date,
          startMinutes: booking.startMinutes,
          startLabel: formatMinutesToAmPm(booking.startMinutes),
          status: booking.status,
          residentId: booking.residentId,
          notes: booking.notes,
        },
      },
    })
  } catch (error) {
    await transaction.rollback()
    console.error('Create Resident Amenity Booking Error:', error)
    return sendError(res, 'Failed to create booking', 500)
  }
}

export const cancelResidentAmenityBooking = async (req: AuthenticatedRequest, res: Response) => {
  const transaction = await sequelize.transaction()
  try {
    const ctx = await loadResidentContext(req)
    if (!ctx) {
      await transaction.rollback()
      return sendError(res, 'Unable to resolve resident context', 401)
    }

    const amenityId = String(req.params.amenityId || '').trim()
    const bookingId = String(req.params.bookingId || '').trim()
    if (!amenityId) {
      await transaction.rollback()
      return sendError(res, 'Amenity id is required', 400)
    }
    if (!bookingId) {
      await transaction.rollback()
      return sendError(res, 'Booking id is required', 400)
    }

    const context = await loadAmenityContext(ctx.locationId, amenityId)
    if (!context || !context.slotConfig) {
      await transaction.rollback()
      return sendError(res, 'Amenity slot setup not found', 404)
    }

    const booking = await AmenitySlotBooking.findOne({
      where: {
        id: bookingId,
        slotConfigId: context.slotConfig.id,
        isDeleted: false,
      },
      transaction,
    })

    if (!booking || booking.status !== AmenityBookingStatus.BOOKED) {
      await transaction.rollback()
      return sendError(res, 'Booking not found', 404)
    }
    if (booking.residentId !== ctx.residentId) {
      await transaction.rollback()
      return sendError(res, 'You can only cancel your own booking', 403)
    }

    const auditUserId = resolveAuditUserId(req)

    await booking.update(
      {
        status: AmenityBookingStatus.CANCELLED,
        updatedBy: auditUserId,
      },
      { transaction },
    )

    await transaction.commit()
    return res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
      data: {
        booking: {
          id: booking.id,
          status: booking.status,
        },
      },
    })
  } catch (error) {
    await transaction.rollback()
    console.error('Cancel Resident Amenity Booking Error:', error)
    return sendError(res, 'Failed to cancel booking', 500)
  }
}

export const listResidentAmenityBookings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ctx = await loadResidentContext(req)
    if (!ctx) return sendError(res, 'Unable to resolve resident context', 401)

    const from = normalizeYmd(req.query.from) || toYmdLocal()
    const to = normalizeYmd(req.query.to)
    const statusInput = normalizeQueryString(req.query.status)?.toUpperCase() || AmenityBookingStatus.BOOKED
    const limitRaw = Number(req.query.limit)
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.trunc(limitRaw))) : 50

    if (to && to < from) return sendError(res, 'to cannot be earlier than from', 400)
    if (![AmenityBookingStatus.BOOKED, AmenityBookingStatus.CANCELLED, 'ALL'].includes(statusInput)) {
      return sendError(res, 'status must be BOOKED, CANCELLED, or ALL', 400)
    }

    const where: Record<string, unknown> = {
      residentId: ctx.residentId,
      isDeleted: false,
      date: to ? { [Op.between]: [from, to] } : { [Op.gte]: from },
    }
    if (statusInput !== 'ALL') where.status = statusInput

    const rows = (await AmenitySlotBooking.findAll({
      where,
      include: [
        {
          model: AmenitySlotConfig,
          as: 'slotConfig',
          required: true,
          where: { isDeleted: false, isActive: true },
          include: [
            {
              model: PropertyAmenity,
              as: 'propertyAmenity',
              required: true,
              where: {
                propertyId: ctx.locationId,
                isDeleted: false,
                isActive: true,
              },
              include: [
                {
                  model: Amenity,
                  as: 'amenity',
                  required: false,
                  where: { isDeleted: false },
                },
              ],
            },
          ],
        },
      ],
      order: [
        ['date', 'ASC'],
        ['startMinutes', 'ASC'],
      ],
      limit,
    })) as Array<
      AmenitySlotBooking & {
        slotConfig?:
          | (AmenitySlotConfig & {
              propertyAmenity?: PropertyAmenityWithConfig | null
            })
          | null
      }
    >

    const bookings = rows.map((booking) => {
      const config = booking.slotConfig || undefined
      const propertyAmenity = config?.propertyAmenity
      const amenity = propertyAmenity?.amenity
      const endMinutes = booking.startMinutes + (config?.durationMin || 0)

      return {
        id: booking.id,
        amenityId: propertyAmenity?.amenityId || null,
        amenityName: amenity?.name || 'Amenity',
        date: booking.date,
        startMinutes: booking.startMinutes,
        startLabel: formatMinutesToAmPm(booking.startMinutes),
        endMinutes,
        endLabel: formatMinutesToAmPm(endMinutes),
        status: booking.status,
        notes: booking.notes,
        createdAt: booking.createdAt,
      }
    })

    return res.status(200).json({
      success: true,
      message: 'Amenity bookings retrieved successfully',
      data: {
        from,
        to: to || null,
        status: statusInput,
        bookings,
      },
    })
  } catch (error) {
    console.error('List Resident Amenity Bookings Error:', error)
    return sendError(res, 'Failed to load bookings', 500)
  }
}
