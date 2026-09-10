import { Router } from 'express'
import staffAuthRouter from './staffAuth.routes.js'
import ticketStaffMobileRouter from './ticketStaffMobile.routes.js'
import gnsRouter from './gns.routes.js'
import fnbEmployeeRouter from './fnbEmployee.routes.js'

export const l3MobileRouter = Router()

// Health check
l3MobileRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'rely-active-L3-mobile-app' })
})

// ── Staff Auth Module (/api/v1/mobile/l3/auth, /api/v1/mobile/l3/staff/auth, /api/v1/mobile/l3/staff) ──
l3MobileRouter.use('/auth', staffAuthRouter)
l3MobileRouter.use('/staff/auth', staffAuthRouter)
l3MobileRouter.use('/staff', staffAuthRouter)

// ── Staff Tickets Module (/api/v1/mobile/l3/tickets & /api/v1/mobile/l3/ticket) ──
l3MobileRouter.use('/tickets', ticketStaffMobileRouter)
l3MobileRouter.use('/ticket', ticketStaffMobileRouter)

// ── Staff F&B Module (/api/v1/mobile/l3/fnb) ──
l3MobileRouter.use('/fnb', fnbEmployeeRouter)

// ── L3 Gate & Security Module (/api/v1/mobile/l3/gns & /api/v1/mobile/l3/gate) ──
l3MobileRouter.use('/gns', gnsRouter)
l3MobileRouter.use('/gate', gnsRouter)

export default l3MobileRouter
