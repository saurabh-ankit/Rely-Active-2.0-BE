import type { Response } from 'express'
import { Op } from 'sequelize'
import { EventRequest, EventVenue, Resident } from '../../../models/index.js'
import { EventRequestStatus } from '../../../enums/event.enum.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import {
  findFirstVenueBookingConflictForRanges,
  formatBookingUnavailableMessage,
  generateEventRequestNumber,
  resolveSelectedAddOnServices,
} from '../../../utils/event.util.js'

async function resolveResidentContext(req: AuthenticatedRequest): Promise<{
  residentId: string
  locationId: string
} | null> {
  const residentId = req.user?.residentId || req.user?.id
  if (!residentId) return null

  const locationId =
    (req.query.locationId as string) ||
    (req.query.locId as string) ||
    req.user?.defaultLocationId ||
    req.locationId ||
    null

  if (locationId) {
    return { residentId, locationId: String(locationId) }
  }

  const resident = await Resident.findByPk(residentId)
  if (!resident?.locId) return null
  return { residentId, locationId: resident.locId }
}

function serializeVenueListItem(venue: EventVenue) {
  const addOnServices = Array.isArray(venue.addOnServices) ? venue.addOnServices : []
  return {
    id: venue.id,
    name: venue.name,
    occupancy: venue.occupancy,
    price: venue.price,
    keyFeatures: venue.keyFeatures,
    otherServices: venue.otherServices,
    coverPhoto: venue.coverPhoto,
    images: venue.images,
    addOnServices,
  }
}

type EventRequestWithVenue = EventRequest & { venue?: EventVenue | null }

function computeEventRequestTotalCost(
  venuePrice: number | string | null | undefined,
  services: Array<{ price?: number | string | null; quantity?: number | null }> | null | undefined,
): number {
  const venueCost = Number(venuePrice ?? 0) || 0
  const servicesTotal = (Array.isArray(services) ? services : []).reduce((sum, service) => {
    const qty = Number(service.quantity ?? 1) || 1
    const unit = Number(service.price ?? 0) || 0
    return sum + unit * qty
  }, 0)
  return venueCost + servicesTotal
}

function serializeResidentEventRequest(request: EventRequestWithVenue) {
  const venue = request.venue
  return {
    id: request.id,
    requestNumber: request.requestNumber || null,
    title: request.title,
    startDate: request.startDate,
    endDate: request.endDate,
    occupancy: request.occupancy,
    customRequest: request.customRequest,
    schedule: Array.isArray(request.schedule) ? request.schedule : null,
    selectedServices: Array.isArray(request.selectedServices) ? request.selectedServices : null,
    status: request.status,
    meetingScheduledAt: request.meetingScheduledAt || null,
    confirmedEventId: request.confirmedEventId || null,
    cancellationReason: request.cancellationReason || null,
    totalCost: computeEventRequestTotalCost(venue?.price, request.selectedServices),
    venueId: request.venueId,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    venue: venue
      ? {
          id: venue.id,
          name: venue.name,
          occupancy: venue.occupancy,
          price: venue.price,
          coverPhoto: venue.coverPhoto,
        }
      : null,
  }
}

/**
 * GET /api/v1/mobile/l1/event-requests
 * Resident's own venue booking requests for the current location.
 */
export async function listMyEventRequests(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ctx = await resolveResidentContext(req)
    if (!ctx) {
      res.status(401).json({ success: false, message: 'Authentication required or location not found' })
      return
    }

    const requests = await EventRequest.findAll({
      where: {
        residentId: ctx.residentId,
        locationId: ctx.locationId,
        isDeleted: false,
      },
      include: [
        {
          model: EventVenue,
          as: 'venue',
          attributes: ['id', 'name', 'occupancy', 'price', 'coverPhoto'],
          required: false,
        },
      ],
      order: [['createdAt', 'DESC']],
    })

    res.status(200).json({
      success: true,
      data: (requests as EventRequestWithVenue[]).map(serializeResidentEventRequest),
    })
  } catch (err) {
    console.error('Error listing L1 event requests:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch event requests' })
  }
}

/**
 * GET /api/v1/mobile/l1/event-requests/:id
 */
export async function getMyEventRequestById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ctx = await resolveResidentContext(req)
    if (!ctx) {
      res.status(401).json({ success: false, message: 'Authentication required or location not found' })
      return
    }

    const { id } = req.params
    const request = (await EventRequest.findOne({
      where: {
        id,
        residentId: ctx.residentId,
        locationId: ctx.locationId,
        isDeleted: false,
      },
      include: [
        {
          model: EventVenue,
          as: 'venue',
          attributes: ['id', 'name', 'occupancy', 'price', 'coverPhoto'],
          required: false,
        },
      ],
    })) as EventRequestWithVenue | null

    if (!request) {
      res.status(404).json({ success: false, message: 'Event request not found' })
      return
    }

    res.status(200).json({
      success: true,
      data: serializeResidentEventRequest(request),
    })
  } catch (err) {
    console.error('Error fetching L1 event request detail:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch event request details' })
  }
}

/**
 * GET /api/v1/mobile/l1/venues?minOccupancy=
 */
export async function getResidentVenues(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ctx = await resolveResidentContext(req)
    if (!ctx) {
      res.status(401).json({ success: false, message: 'Authentication required or location not found' })
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      locationId: ctx.locationId,
      isDeleted: false,
      isActive: true,
    }

    const minOccupancyRaw = req.query.minOccupancy
    if (minOccupancyRaw !== undefined && minOccupancyRaw !== null && String(minOccupancyRaw).trim() !== '') {
      const minOccupancy = Number(minOccupancyRaw)
      if (!Number.isFinite(minOccupancy) || minOccupancy < 1) {
        res.status(400).json({ success: false, message: 'minOccupancy must be a positive number' })
        return
      }
      where.occupancy = { [Op.gte]: minOccupancy }
    }

    const venues = await EventVenue.findAll({
      where,
      order: [['name', 'ASC']],
    })

    res.status(200).json({
      success: true,
      data: venues.map(serializeVenueListItem),
    })
  } catch (err) {
    console.error('Error fetching L1 venues:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch venues' })
  }
}

/**
 * GET /api/v1/mobile/l1/venues/availability?venueId=&startDate=&endDate=
 */
export async function checkResidentVenueAvailability(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ctx = await resolveResidentContext(req)
    if (!ctx) {
      res.status(401).json({ success: false, message: 'Authentication required or location not found' })
      return
    }

    const venueId = String(req.query.venueId || '').trim()
    const startDateRaw = req.query.startDate
    const endDateRaw = req.query.endDate

    if (!venueId) {
      res.status(400).json({ success: false, message: 'venueId is required' })
      return
    }
    if (!startDateRaw || !endDateRaw) {
      res.status(400).json({ success: false, message: 'startDate and endDate are required' })
      return
    }

    const startDate = new Date(String(startDateRaw))
    const endDate = new Date(String(endDateRaw))
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      res.status(400).json({ success: false, message: 'Invalid startDate or endDate' })
      return
    }
    if (endDate <= startDate) {
      res.status(400).json({ success: false, message: 'endDate must be after startDate' })
      return
    }

    const venue = await EventVenue.findOne({
      where: {
        id: venueId,
        locationId: ctx.locationId,
        isDeleted: false,
        isActive: true,
      },
    })
    if (!venue) {
      res.status(404).json({ success: false, message: 'Venue not found' })
      return
    }

    const conflictResult = await findFirstVenueBookingConflictForRanges({
      venueId,
      locationId: ctx.locationId,
      ranges: [{ startDate, endDate }],
    })

    if (conflictResult) {
      const message = formatBookingUnavailableMessage(
        conflictResult.conflict.startDate,
        conflictResult.conflict.endDate,
      )
      res.status(200).json({
        success: true,
        data: {
          available: false,
          message,
          conflict: {
            source: conflictResult.conflict.source,
            id: conflictResult.conflict.id,
            title: conflictResult.conflict.title,
            startDate: conflictResult.conflict.startDate,
            endDate: conflictResult.conflict.endDate,
          },
        },
      })
      return
    }

    res.status(200).json({
      success: true,
      data: {
        available: true,
        message: null,
        conflict: null,
      },
    })
  } catch (err) {
    console.error('Error checking L1 venue availability:', err)
    res.status(500).json({ success: false, message: 'Failed to check venue availability' })
  }
}

/**
 * GET /api/v1/mobile/l1/venues/:id
 */
export async function getResidentVenueById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ctx = await resolveResidentContext(req)
    if (!ctx) {
      res.status(401).json({ success: false, message: 'Authentication required or location not found' })
      return
    }

    const { id } = req.params
    const venue = await EventVenue.findOne({
      where: {
        id,
        locationId: ctx.locationId,
        isDeleted: false,
        isActive: true,
      },
    })

    if (!venue) {
      res.status(404).json({ success: false, message: 'Venue not found' })
      return
    }

    res.status(200).json({
      success: true,
      data: serializeVenueListItem(venue),
    })
  } catch (err) {
    console.error('Error fetching L1 venue detail:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch venue details' })
  }
}

/**
 * POST /api/v1/mobile/l1/event-requests
 * Body: { title, startDate, endDate, occupancy, venueId, customRequest?, schedule?, selectedServices? }
 * schedule?: Array<{ startDate, endDate }> — per-day slots for multi-day bookings
 * selectedServices?: AddOnService[] — services + quantities chosen from venue add-ons
 */
export async function createEventRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ctx = await resolveResidentContext(req)
    if (!ctx) {
      res.status(401).json({ success: false, message: 'Authentication required or location not found' })
      return
    }

    const title = String(req.body?.title || '').trim()
    const startDateRaw = req.body?.startDate
    const endDateRaw = req.body?.endDate
    const venueId = String(req.body?.venueId || '').trim()
    const occupancy = Number(req.body?.occupancy)
    const customRequestRaw = req.body?.customRequest
    const customRequest =
      customRequestRaw !== undefined && customRequestRaw !== null && String(customRequestRaw).trim() !== ''
        ? String(customRequestRaw).trim()
        : null
    const scheduleRaw = req.body?.schedule
    const selectedServicesRaw = req.body?.selectedServices

    if (!title) {
      res.status(400).json({ success: false, message: 'title is required' })
      return
    }
    if (!startDateRaw || !endDateRaw) {
      res.status(400).json({ success: false, message: 'startDate and endDate are required' })
      return
    }
    if (!venueId) {
      res.status(400).json({ success: false, message: 'venueId is required' })
      return
    }
    if (!Number.isInteger(occupancy) || occupancy < 1) {
      res.status(400).json({ success: false, message: 'occupancy must be a positive integer' })
      return
    }

    const startDate = new Date(startDateRaw)
    const endDate = new Date(endDateRaw)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      res.status(400).json({ success: false, message: 'Invalid startDate or endDate' })
      return
    }
    if (endDate <= startDate) {
      res.status(400).json({ success: false, message: 'endDate must be after startDate' })
      return
    }

    let schedule: Array<{ startDate: Date; endDate: Date }> | null = null
    if (scheduleRaw !== undefined && scheduleRaw !== null) {
      if (!Array.isArray(scheduleRaw) || scheduleRaw.length === 0) {
        res.status(400).json({ success: false, message: 'schedule must be a non-empty array' })
        return
      }
      schedule = []
      for (const slot of scheduleRaw) {
        const slotStart = new Date(slot?.startDate)
        const slotEnd = new Date(slot?.endDate)
        if (Number.isNaN(slotStart.getTime()) || Number.isNaN(slotEnd.getTime())) {
          res.status(400).json({ success: false, message: 'Invalid schedule slot startDate or endDate' })
          return
        }
        if (slotEnd <= slotStart) {
          res.status(400).json({
            success: false,
            message: 'Each schedule slot endDate must be after startDate',
          })
          return
        }
        schedule.push({ startDate: slotStart, endDate: slotEnd })
      }
      schedule.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    }

    const venue = await EventVenue.findOne({
      where: {
        id: venueId,
        locationId: ctx.locationId,
        isDeleted: false,
        isActive: true,
      },
    })

    if (!venue) {
      res.status(404).json({ success: false, message: 'Venue not found in this location' })
      return
    }

    if (Number(venue.occupancy) < occupancy) {
      res.status(400).json({
        success: false,
        message: 'Selected venue occupancy is less than expected people',
      })
      return
    }

    const selectedResult = resolveSelectedAddOnServices(selectedServicesRaw, venue.addOnServices)
    if (!selectedResult.ok) {
      res.status(400).json({ success: false, message: selectedResult.error })
      return
    }

    const ranges = schedule && schedule.length > 0 ? schedule : [{ startDate, endDate }]
    const conflictResult = await findFirstVenueBookingConflictForRanges({
      venueId: venue.id,
      locationId: ctx.locationId,
      ranges,
    })
    if (conflictResult) {
      res.status(409).json({
        success: false,
        message: formatBookingUnavailableMessage(conflictResult.conflict.startDate, conflictResult.conflict.endDate),
      })
      return
    }

    const overallStart = schedule && schedule.length > 0 ? schedule[0]!.startDate : startDate
    const overallEnd = schedule && schedule.length > 0 ? schedule[schedule.length - 1]!.endDate : endDate

    const requestNumber = generateEventRequestNumber()

    const request = await EventRequest.create({
      title,
      startDate: overallStart,
      endDate: overallEnd,
      occupancy,
      venueId: venue.id,
      customRequest,
      schedule: schedule
        ? schedule.map((s) => ({
            startDate: s.startDate.toISOString(),
            endDate: s.endDate.toISOString(),
          }))
        : null,
      selectedServices: selectedResult.services,
      requestNumber,
      residentId: ctx.residentId,
      locationId: ctx.locationId,
      status: EventRequestStatus.OPEN,
      isActive: true,
      isDeleted: false,
      createdBy: ctx.residentId,
      updatedBy: ctx.residentId,
    })

    res.status(201).json({
      success: true,
      message: `Event booking request submitted successfully. Request ID: ${requestNumber}`,
      data: {
        id: request.id,
        requestNumber: request.requestNumber,
        title: request.title,
        startDate: request.startDate,
        endDate: request.endDate,
        occupancy: request.occupancy,
        venueId: request.venueId,
        customRequest: request.customRequest,
        schedule: request.schedule,
        selectedServices: request.selectedServices,
        status: request.status,
        createdAt: request.createdAt,
      },
    })
  } catch (err) {
    console.error('Error creating L1 event request:', err)
    // Unique constraint race on requestNumber — retry once with a new number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((err as any)?.name === 'SequelizeUniqueConstraintError') {
      res.status(409).json({
        success: false,
        message: 'Could not generate a unique request ID. Please try again.',
      })
      return
    }
    res.status(500).json({ success: false, message: 'Failed to submit event booking request' })
  }
}
