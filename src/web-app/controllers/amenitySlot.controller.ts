import type { Response } from 'express'
import { Op } from 'sequelize'
import sequelize from '../../config/db/index.js'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import {
  Amenity,
  AmenitySlotBlock,
  AmenitySlotBooking,
  AmenitySlotConfig,
  PropertyAmenity,
  PropertyFloor,
  PropertyUnit,
  Resident,
} from '../../models/index.js'
import { resolveNotificationActor } from '../../services/notifications/notificationAudience.service.js'
import { publishAmenitySlotBookedNotificationSafe } from '../../services/notifications/amenitySlotNotification.service.js'
import { AmenityBookingStatus, type AmenitySlotBookingAttributes } from '../../models/amenitySlotBooking.model.js'
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
} from '../../utils/amenitySlot.util.js'
import { parseTimeToMinutes } from '../../utils/roster.util.js'

type PropertyAmenityWithConfig = PropertyAmenity & {
  amenity?: Amenity | null
  slotConfig?: AmenitySlotConfig | null
}

const sendError = (res: Response, message: string, status = 400, details?: unknown) =>
  res.status(status).json({ success: false, message, ...(details ? { data: details } : {}) })

const readSlotSettings = (settings: unknown): { openMinutes: number; closeMinutes: number } | null => {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null
  const source = settings as Record<string, unknown>
  const from = typeof source.availableFrom === 'string' ? source.availableFrom.trim() : ''
  const to = typeof source.availableTo === 'string' ? source.availableTo.trim() : ''
  const openMinutes = parseTimeToMinutes(from)
  const closeMinutes = parseTimeToMinutes(to)
  if (openMinutes === null || closeMinutes === null || closeMinutes <= openMinutes) return null
  return { openMinutes, closeMinutes }
}

const loadAmenityContext = async (locationId: string, amenityId: string): Promise<PropertyAmenityWithConfig | null> => {
  return (await PropertyAmenity.findOne({
    where: {
      propertyId: locationId,
      amenityId,
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

const bookingResidentInclude = [
  {
    model: Resident,
    as: 'resident',
    attributes: ['id', 'firstName', 'lastName', 'phone', 'email'],
    include: [
      {
        model: PropertyUnit,
        as: 'unit',
        attributes: ['id', 'unit_number'],
        include: [{ model: PropertyFloor, as: 'floor', attributes: ['id', 'floor_number'], required: false }],
        required: false,
      },
    ],
    required: false,
  },
]

const formatBooking = (
  booking: AmenitySlotBooking,
): {
  id: string
  date: string
  startMinutes: number
  residentId: string
  residentName: string
  floorNumber: number | null
  unitNumber: string | null
  status: AmenitySlotBookingAttributes['status']
  createdAt?: Date
} => {
  const raw = booking.toJSON() as AmenitySlotBookingAttributes & {
    resident?: Resident & {
      unit?: (PropertyUnit & { floor?: PropertyFloor | null }) | null
    }
  }
  const resident = raw.resident
  const residentName = `${resident?.firstName || ''} ${resident?.lastName || ''}`.trim() || 'Resident'
  const floorNumber = resident?.unit?.floor?.floor_number ?? null
  const unitNumber = resident?.unit?.unit_number || null
  const formatted = {
    id: raw.id,
    date: raw.date,
    startMinutes: raw.startMinutes,
    residentId: raw.residentId,
    residentName,
    floorNumber,
    unitNumber,
    status: raw.status,
  }
  if (raw.createdAt) {
    return { ...formatted, createdAt: raw.createdAt }
  }
  return formatted
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

const bookingFitsConfig = (bookingDate: string, startMinutes: number, config: AmenitySlotConfig): boolean => {
  const days = normalizeDaysOfWeek(config.daysOfWeek)
  const day = ymdToDayOfWeekMon0(bookingDate)
  if (day === null || !days.includes(day)) return false
  const starts = generateSlotStartMinutes(config.openMinutes, config.closeMinutes, config.durationMin)
  return starts.includes(startMinutes)
}

export const getAmenitySlotConfig = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = req.params.locationId as string
    const amenityId = req.params.amenityId as string

    const context = await loadAmenityContext(locationId, amenityId)
    if (!context) return sendError(res, 'Amenity not found for this property', 404)
    if (!context.slotBookable) return sendError(res, 'This amenity is not slot-bookable', 400)

    const config = context.slotConfig
    if (!config) {
      const fallback = readSlotSettings(context.settings)
      return res.status(200).json({
        success: true,
        data: {
          hasSetup: false,
          config: null,
          suggestedWindow: fallback,
        },
      })
    }

    const data = {
      id: config.id,
      propertyAmenityId: config.propertyAmenityId,
      openMinutes: config.openMinutes,
      closeMinutes: config.closeMinutes,
      durationMin: config.durationMin,
      capacity: config.capacity,
      daysOfWeek: normalizeDaysOfWeek(config.daysOfWeek),
    }

    return res.status(200).json({
      success: true,
      data: {
        hasSetup: true,
        config: data,
        summary: getConfigSummary(data),
      },
    })
  } catch (error) {
    console.error('Get Amenity Slot Config Error:', error)
    return sendError(res, 'Failed to load slot config', 500)
  }
}

export const updateAmenitySlotConfig = async (req: AuthenticatedRequest, res: Response) => {
  const transaction = await sequelize.transaction()
  try {
    const locationId = req.params.locationId as string
    const amenityId = req.params.amenityId as string
    const userId = req.user?.id || null
    const {
      openMinutes,
      closeMinutes,
      durationMin,
      capacity,
      daysOfWeek,
      force,
    }: {
      openMinutes: number
      closeMinutes: number
      durationMin: number
      capacity: number
      daysOfWeek: number[]
      force?: boolean
    } = req.body

    const context = await loadAmenityContext(locationId, amenityId)
    if (!context) {
      await transaction.rollback()
      return sendError(res, 'Amenity not found for this property', 404)
    }
    if (!context.slotBookable) {
      await transaction.rollback()
      return sendError(res, 'This amenity is not slot-bookable', 400)
    }

    const normalizedDays = normalizeDaysOfWeek(daysOfWeek)

    let slotConfig = await AmenitySlotConfig.findOne({
      where: { propertyAmenityId: context.id, isDeleted: false },
      transaction,
    })

    if (!slotConfig) {
      slotConfig = await AmenitySlotConfig.create(
        {
          propertyAmenityId: context.id,
          openMinutes,
          closeMinutes,
          durationMin,
          capacity,
          daysOfWeek: normalizedDays,
          createdBy: userId,
          updatedBy: userId,
          isActive: true,
          isDeleted: false,
        },
        { transaction },
      )

      await transaction.commit()
      return res.status(200).json({
        success: true,
        message: 'Slot setup saved',
        data: {
          hasSetup: true,
          config: {
            id: slotConfig.id,
            propertyAmenityId: slotConfig.propertyAmenityId,
            openMinutes: slotConfig.openMinutes,
            closeMinutes: slotConfig.closeMinutes,
            durationMin: slotConfig.durationMin,
            capacity: slotConfig.capacity,
            daysOfWeek: normalizedDays,
          },
          summary: getConfigSummary({
            openMinutes,
            closeMinutes,
            durationMin,
            capacity,
            daysOfWeek: normalizedDays,
          }),
        },
      })
    }

    const futureBookings = (await AmenitySlotBooking.findAll({
      where: {
        slotConfigId: slotConfig.id,
        isDeleted: false,
        status: AmenityBookingStatus.BOOKED,
        date: { [Op.gte]: toYmdLocal() },
      },
      include: bookingResidentInclude,
      order: [
        ['date', 'ASC'],
        ['startMinutes', 'ASC'],
      ],
      transaction,
    })) as AmenitySlotBooking[]

    const pseudoConfig = {
      ...slotConfig,
      openMinutes,
      closeMinutes,
      durationMin,
      daysOfWeek: normalizedDays,
    } as AmenitySlotConfig

    const impactedBookings = futureBookings.filter(
      (booking) => !bookingFitsConfig(booking.date, booking.startMinutes, pseudoConfig),
    )

    if (impactedBookings.length > 0 && !force) {
      await transaction.rollback()
      return sendError(res, 'Some future bookings fall outside the new setup', 409, {
        impactedBookings: impactedBookings.map((booking) => ({
          ...formatBooking(booking),
          startLabel: formatMinutesToAmPm(booking.startMinutes),
        })),
      })
    }

    await slotConfig.update(
      {
        openMinutes,
        closeMinutes,
        durationMin,
        capacity,
        daysOfWeek: normalizedDays,
        updatedBy: userId,
        isDeleted: false,
        isActive: true,
      },
      { transaction },
    )

    await transaction.commit()

    return res.status(200).json({
      success: true,
      message: 'Slot setup saved',
      data: {
        hasSetup: true,
        config: {
          id: slotConfig.id,
          propertyAmenityId: slotConfig.propertyAmenityId,
          openMinutes,
          closeMinutes,
          durationMin,
          capacity,
          daysOfWeek: normalizedDays,
        },
        impactedBookingsCount: impactedBookings.length,
        summary: getConfigSummary({
          openMinutes,
          closeMinutes,
          durationMin,
          capacity,
          daysOfWeek: normalizedDays,
        }),
      },
    })
  } catch (error) {
    await transaction.rollback()
    console.error('Update Amenity Slot Config Error:', error)
    return sendError(res, 'Failed to save slot setup', 500)
  }
}

export const getAmenitySlotsForDate = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = req.params.locationId as string
    const amenityId = req.params.amenityId as string
    const { date } = req.query as { date: string }

    const context = await loadAmenityContext(locationId, amenityId)
    if (!context) return sendError(res, 'Amenity not found for this property', 404)
    if (!context.slotBookable) return sendError(res, 'This amenity is not slot-bookable', 400)

    const config = context.slotConfig
    if (!config) {
      return res.status(200).json({
        success: true,
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

    const bookings = (await AmenitySlotBooking.findAll({
      where: {
        slotConfigId: config.id,
        date,
        status: AmenityBookingStatus.BOOKED,
        isDeleted: false,
      },
      include: bookingResidentInclude,
      order: [['createdAt', 'ASC']],
    })) as AmenitySlotBooking[]

    const blocks = await AmenitySlotBlock.findAll({
      where: {
        slotConfigId: config.id,
        date,
        isDeleted: false,
      },
    })

    const bookingsByStart = new Map<number, AmenitySlotBooking[]>()
    for (const booking of bookings) {
      const rows = bookingsByStart.get(booking.startMinutes) || []
      rows.push(booking)
      bookingsByStart.set(booking.startMinutes, rows)
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
        blockId: blocked?.id || null,
        bookings: slotBookings.map(formatBooking),
      }
    })

    const generatedSet = new Set(generatedStarts)
    const legacyBookings = bookings.filter((booking) => !generatedSet.has(booking.startMinutes))
    const legacySlots = legacyBookings.map((booking) => ({
      startMinutes: booking.startMinutes,
      startLabel: formatMinutesToAmPm(booking.startMinutes),
      endMinutes: booking.startMinutes + config.durationMin,
      endLabel: formatMinutesToAmPm(booking.startMinutes + config.durationMin),
      period: classifySlotPeriod(booking.startMinutes),
      status: SLOT_STATUSES.LEGACY_BOOKED,
      capacity: config.capacity,
      bookedCount: 1,
      remainingCount: 0,
      isPast: isPastSlot(date, booking.startMinutes),
      isBlocked: false,
      blockId: null,
      bookings: [formatBooking(booking)],
      isLegacy: true,
    }))

    return res.status(200).json({
      success: true,
      data: {
        date,
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
    console.error('Get Amenity Slots Error:', error)
    return sendError(res, 'Failed to load slots', 500)
  }
}

export const createAmenitySlotBooking = async (req: AuthenticatedRequest, res: Response) => {
  const transaction = await sequelize.transaction()
  try {
    const locationId = req.params.locationId as string
    const amenityId = req.params.amenityId as string
    const { date, startMinutes, residentId, notes } = req.body as {
      date: string
      startMinutes: number
      residentId: string
      notes?: string
    }

    const context = await loadAmenityContext(locationId, amenityId)
    if (!context) {
      await transaction.rollback()
      return sendError(res, 'Amenity not found for this property', 404)
    }
    if (!context.slotBookable) {
      await transaction.rollback()
      return sendError(res, 'This amenity is not slot-bookable', 400)
    }

    const config = context.slotConfig
    if (!config) {
      await transaction.rollback()
      return sendError(res, 'Slot setup not found for this amenity', 400)
    }

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
        id: residentId,
        locId: locationId,
        isDeleted: false,
      },
      transaction,
    })
    if (!resident) {
      await transaction.rollback()
      return sendError(res, 'Resident not found for this property', 404)
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
        residentId,
        status: AmenityBookingStatus.BOOKED,
        isDeleted: false,
      },
      transaction,
    })
    if (existingResidentBooking) {
      await transaction.rollback()
      return sendError(res, 'Resident already has this slot', 409)
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

    const booking = await AmenitySlotBooking.create(
      {
        slotConfigId: config.id,
        date,
        startMinutes,
        residentId,
        status: AmenityBookingStatus.BOOKED,
        notes: notes?.trim() || null,
        createdBy: req.user?.id || null,
        updatedBy: req.user?.id || null,
      },
      { transaction },
    )

    await transaction.commit()

    const residentName = `${resident.firstName || ''} ${resident.lastName || ''}`.trim() || 'Resident'
    const amenityName = context.amenity?.name || 'Amenity'
    await publishAmenitySlotBookedNotificationSafe({
      locationId,
      amenityId,
      amenityName,
      date,
      startMinutes,
      residentId: resident.id,
      residentName,
      adminUserId: req.user?.id || null,
      actor: resolveNotificationActor(req, req.user?.email || 'Admin'),
    })

    return res.status(201).json({
      success: true,
      message: `Booked ${formatMinutesToAmPm(startMinutes)} successfully`,
      data: {
        booking: {
          id: booking.id,
          date: booking.date,
          startMinutes: booking.startMinutes,
          residentId: booking.residentId,
          status: booking.status,
        },
      },
    })
  } catch (error) {
    await transaction.rollback()
    console.error('Create Amenity Slot Booking Error:', error)
    return sendError(res, 'Failed to create booking', 500)
  }
}

export const cancelAmenitySlotBooking = async (req: AuthenticatedRequest, res: Response) => {
  const transaction = await sequelize.transaction()
  try {
    const locationId = req.params.locationId as string
    const amenityId = req.params.amenityId as string
    const bookingId = req.params.bookingId as string

    const context = await loadAmenityContext(locationId, amenityId)
    if (!context) {
      await transaction.rollback()
      return sendError(res, 'Amenity not found for this property', 404)
    }
    if (!context.slotBookable || !context.slotConfig) {
      await transaction.rollback()
      return sendError(res, 'Slot setup not found for this amenity', 400)
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

    await booking.update(
      {
        status: AmenityBookingStatus.CANCELLED,
        updatedBy: req.user?.id || null,
      },
      { transaction },
    )

    await transaction.commit()

    return res.status(200).json({
      success: true,
      message: 'Booking cancelled',
    })
  } catch (error) {
    await transaction.rollback()
    console.error('Cancel Amenity Slot Booking Error:', error)
    return sendError(res, 'Failed to cancel booking', 500)
  }
}

export const blockAmenitySlot = async (req: AuthenticatedRequest, res: Response) => {
  const transaction = await sequelize.transaction()
  try {
    const locationId = req.params.locationId as string
    const amenityId = req.params.amenityId as string
    const { date, startMinutes, reason } = req.body as {
      date: string
      startMinutes: number
      reason?: string
    }

    const context = await loadAmenityContext(locationId, amenityId)
    if (!context) {
      await transaction.rollback()
      return sendError(res, 'Amenity not found for this property', 404)
    }
    if (!context.slotBookable || !context.slotConfig) {
      await transaction.rollback()
      return sendError(res, 'Slot setup not found for this amenity', 400)
    }

    const config = context.slotConfig
    const starts = generateSlotStartMinutes(config.openMinutes, config.closeMinutes, config.durationMin)
    if (!starts.includes(startMinutes)) {
      await transaction.rollback()
      return sendError(res, 'Invalid slot for this setup', 400)
    }
    if (isPastSlot(date, startMinutes)) {
      await transaction.rollback()
      return sendError(res, 'Cannot block a past slot', 400)
    }

    const activeBookings = await AmenitySlotBooking.count({
      where: {
        slotConfigId: config.id,
        date,
        startMinutes,
        status: AmenityBookingStatus.BOOKED,
        isDeleted: false,
      },
      transaction,
    })
    if (activeBookings > 0) {
      await transaction.rollback()
      return sendError(res, 'Cannot block a slot with active bookings', 409)
    }

    const existing = await AmenitySlotBlock.findOne({
      where: {
        slotConfigId: config.id,
        date,
        startMinutes,
        isDeleted: false,
      },
      transaction,
    })
    if (existing) {
      await transaction.rollback()
      return sendError(res, 'Slot is already blocked', 409)
    }

    const block = await AmenitySlotBlock.create(
      {
        slotConfigId: config.id,
        date,
        startMinutes,
        reason: reason?.trim() || null,
        createdBy: req.user?.id || null,
        updatedBy: req.user?.id || null,
      },
      { transaction },
    )

    await transaction.commit()

    return res.status(201).json({
      success: true,
      message: 'Slot blocked',
      data: {
        block: {
          id: block.id,
          date: block.date,
          startMinutes: block.startMinutes,
        },
      },
    })
  } catch (error) {
    await transaction.rollback()
    console.error('Block Amenity Slot Error:', error)
    return sendError(res, 'Failed to block slot', 500)
  }
}

export const unblockAmenitySlot = async (req: AuthenticatedRequest, res: Response) => {
  const transaction = await sequelize.transaction()
  try {
    const locationId = req.params.locationId as string
    const amenityId = req.params.amenityId as string
    const blockId = req.params.blockId as string

    const context = await loadAmenityContext(locationId, amenityId)
    if (!context) {
      await transaction.rollback()
      return sendError(res, 'Amenity not found for this property', 404)
    }
    if (!context.slotBookable || !context.slotConfig) {
      await transaction.rollback()
      return sendError(res, 'Slot setup not found for this amenity', 400)
    }

    const block = await AmenitySlotBlock.findOne({
      where: {
        id: blockId,
        slotConfigId: context.slotConfig.id,
        isDeleted: false,
      },
      transaction,
    })

    if (!block) {
      await transaction.rollback()
      return sendError(res, 'Block not found', 404)
    }

    await block.update(
      {
        isDeleted: true,
        isActive: false,
        updatedBy: req.user?.id || null,
      },
      { transaction },
    )

    await transaction.commit()

    return res.status(200).json({
      success: true,
      message: 'Slot unblocked',
    })
  } catch (error) {
    await transaction.rollback()
    console.error('Unblock Amenity Slot Error:', error)
    return sendError(res, 'Failed to unblock slot', 500)
  }
}
