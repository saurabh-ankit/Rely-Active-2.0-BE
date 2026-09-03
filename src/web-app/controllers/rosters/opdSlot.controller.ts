import type { Response, NextFunction } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { RosterAssignmentDate, RosterOpdSlot, RosterOpdBooking, Resident } from '../../../models/index.js'
import { OpdBookingService } from '../../../modules/rosters/domain/opd-booking.service.js'
import { resolveCompanyId } from '../../../utils/resolveCompanyId.js'

/**
 * GET /api/v1/roster/companies/:companyId/locations/:locationId/roster-dates/:dateId/opd-slots
 */
export async function getOpdSlotsForDate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const companyId = await resolveCompanyId(req.params.companyId as string, req.user?.companyId)
    const locationId = req.params.locationId as string
    const dateId = req.params.dateId as string

    const dateInstance = await RosterAssignmentDate.findOne({
      where: { id: dateId, companyId, locationId, isDeleted: false },
    })

    if (!dateInstance) {
      return res.status(404).json({ success: false, message: 'Roster date instance not found.' })
    }

    const slots = await RosterOpdSlot.findAll({
      where: { rosterAssignmentDateId: dateId, activeToken: 'ACTIVE', isDeleted: false },
      include: [
        {
          model: RosterOpdBooking,
          as: 'bookings',
          where: { activeToken: 'ACTIVE', status: 'CONFIRMED', isDeleted: false },
          required: false,
          include: [{ model: Resident, as: 'resident', required: false }],
        },
      ],
      order: [['slotNumber', 'ASC']],
    })

    return res.status(200).json({ success: true, data: slots })
  } catch (error) {
    next(error)
  }
}

/**
 * POST /api/v1/roster/companies/:companyId/locations/:locationId/opd-slots/:slotId/book
 */
export async function bookOpdSlot(req: AuthenticatedRequest, res: Response, _next: NextFunction) {
  try {
    const slotId = req.params.slotId as string
    const { residentId, notes } = req.body

    const booking = await OpdBookingService.bookSlot({
      opdSlotId: slotId,
      residentId: residentId as string,
      bookedByUserId: req.user?.id || 'system',
      ...(notes ? { notes: notes as string } : {}),
    })

    return res.status(201).json({
      success: true,
      message: 'OPD slot booked successfully.',
      data: booking,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Booking failed.'
    return res.status(422).json({ success: false, message })
  }
}

/**
 * DELETE /api/v1/roster/companies/:companyId/locations/:locationId/opd-bookings/:bookingId
 */
export async function cancelOpdBooking(req: AuthenticatedRequest, res: Response, _next: NextFunction) {
  try {
    const bookingId = req.params.bookingId as string
    const { cancelledReason } = req.body

    const booking = await OpdBookingService.cancelBooking(
      bookingId,
      (cancelledReason as string) || 'Cancelled by user',
      req.user?.id || 'system',
    )

    return res.status(200).json({
      success: true,
      message: 'OPD booking cancelled successfully.',
      data: booking,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cancellation failed.'
    return res.status(422).json({ success: false, message })
  }
}
