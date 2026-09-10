import { Router } from 'express'
import residentAuthRouter from './residentAuth.routes.js'
import residentDetailsRouter from './residentDetails.routes.js'
import fnbMobileRouter from './fnbMobile.routes.js'
import ticketMobileRouter from './ticketMobile.routes.js'
import gnsRouter from './gns.routes.js'
import eventMobileRouter, { eventVenueMobileRouter, eventRequestMobileRouter } from './eventMobile.routes.js'

export const l1MobileRouter = Router()

// Health check
l1MobileRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'rely-active-L1-mobile-app' })
})

// ── Auth & Resident Module (/api/v1/mobile/l1/auth, /api/v1/mobile/l1/resident) ──
l1MobileRouter.use('/resident/auth', residentAuthRouter)
l1MobileRouter.use('/resident', residentDetailsRouter)
l1MobileRouter.use('/resident', residentAuthRouter)
l1MobileRouter.use('/residents', residentDetailsRouter)
l1MobileRouter.use('/auth', residentAuthRouter)

// ── Tickets Module (/api/v1/mobile/l1/tickets & /api/v1/mobile/l1/ticket) ──
l1MobileRouter.use('/tickets', ticketMobileRouter)
l1MobileRouter.use('/ticket', ticketMobileRouter)

// ── Food & Beverage Module (/api/v1/mobile/l1/fnb) ──
l1MobileRouter.use('/fnb', fnbMobileRouter)

// ── Gate & Security Module (/api/v1/mobile/l1/gns & /api/v1/mobile/l1/gate) ──
l1MobileRouter.use('/gns', gnsRouter)
l1MobileRouter.use('/gate', gnsRouter)

// ── Events Module (/api/v1/mobile/l1/events, /venues, /event-requests) ──
// Plural /events/* module paths
l1MobileRouter.use('/events/venues', eventVenueMobileRouter)
l1MobileRouter.use('/events/event-requests', eventRequestMobileRouter)
l1MobileRouter.use('/events/requests', eventRequestMobileRouter)
l1MobileRouter.use('/events', eventMobileRouter)

// Singular /event/* module paths
l1MobileRouter.use('/event/venues', eventVenueMobileRouter)
l1MobileRouter.use('/event/event-requests', eventRequestMobileRouter)
l1MobileRouter.use('/event/requests', eventRequestMobileRouter)
l1MobileRouter.use('/event', eventMobileRouter)

// Direct venue & request endpoints for backwards compatibility
l1MobileRouter.use('/venues', eventVenueMobileRouter)
l1MobileRouter.use('/event-requests', eventRequestMobileRouter)

export default l1MobileRouter
