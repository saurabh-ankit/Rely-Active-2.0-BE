import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import {
  checkResidentVenueAvailability,
  createEventRequest,
  getMyEventRequestById,
  getResidentEventById,
  getResidentEvents,
  getResidentVenueById,
  getResidentVenues,
  listMyEventRequests,
  reserveEventSeats,
} from '../controllers/eventMobile.controller.js'

export const eventMobileRouter = Router()
export const eventVenueMobileRouter = Router()
export const eventRequestMobileRouter = Router()

// Apply authentication middleware
eventMobileRouter.use(authenticate)
eventVenueMobileRouter.use(authenticate)
eventRequestMobileRouter.use(authenticate)

// ── Event Routes (/events) ──────────────────────────────────────────────────
eventMobileRouter.get('/', getResidentEvents)
eventMobileRouter.get('/:id', getResidentEventById)
eventMobileRouter.post('/:id/reserve', reserveEventSeats)

// ── Venue Routes (/venues) ──────────────────────────────────────────────────
eventVenueMobileRouter.get('/', getResidentVenues)
eventVenueMobileRouter.get('/availability', checkResidentVenueAvailability)
eventVenueMobileRouter.get('/:id', getResidentVenueById)

// ── Event Request Routes (/event-requests) ──────────────────────────────────
eventRequestMobileRouter.get('/', listMyEventRequests)
eventRequestMobileRouter.get('/:id', getMyEventRequestById)
eventRequestMobileRouter.post('/', createEventRequest)

export default eventMobileRouter
