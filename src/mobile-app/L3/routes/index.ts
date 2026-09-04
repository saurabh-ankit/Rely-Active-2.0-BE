import { Router } from 'express'
import staffAuthRouter from './staffAuth.routes.js'
import ticketStaffMobileRouter from './ticketStaffMobile.routes.js'
import fnbEmployeeRouter from './fnbEmployee.routes.js'

export const l3MobileRouter = Router()

// Health check
l3MobileRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'rely-active-L3-mobile-app' })
})

// Staff Auth (/api/v1/mobile/l3/auth & /api/v1/mobile/l3/staff/auth)
l3MobileRouter.use('/auth', staffAuthRouter)
l3MobileRouter.use('/staff/auth', staffAuthRouter)

// Staff Tickets (/api/v1/mobile/l3/tickets)
l3MobileRouter.use('/tickets', ticketStaffMobileRouter)

// Staff F&B Delivery (/api/v1/mobile/l3/fnb)
l3MobileRouter.use('/fnb', fnbEmployeeRouter)

export default l3MobileRouter
