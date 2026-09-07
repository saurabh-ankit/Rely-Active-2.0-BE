import { Router } from 'express'
import residentAuthRouter from './residentAuth.routes.js'
import fnbMobileRouter from './fnbMobile.routes.js'
import ticketMobileRouter from './ticketMobile.routes.js'
import eventMobileRouter from './eventMobile.routes.js'
import eventVenueMobileRouter from './eventVenueMobile.routes.js'
import eventRequestMobileRouter from './eventRequestMobile.routes.js'

export const l1MobileRouter = Router()

// Resident Auth (/api/v1/mobile/l1/resident/auth & /api/v1/mobile/l1/auth)
l1MobileRouter.use('/resident/auth', residentAuthRouter)
l1MobileRouter.use('/auth', residentAuthRouter)

// Resident Tickets (/api/v1/mobile/l1/tickets)
l1MobileRouter.use('/tickets', ticketMobileRouter)

// Resident Food & Beverage (/api/v1/mobile/l1/fnb)
l1MobileRouter.use('/fnb', fnbMobileRouter)

// Resident Event Venues (/api/v1/mobile/l1/venues)
l1MobileRouter.use('/venues', eventVenueMobileRouter)

// Resident Event Requests / RFQ (/api/v1/mobile/l1/event-requests)
l1MobileRouter.use('/event-requests', eventRequestMobileRouter)

// Resident Events (/api/v1/mobile/l1/events)
l1MobileRouter.use('/events', eventMobileRouter)

export default l1MobileRouter
