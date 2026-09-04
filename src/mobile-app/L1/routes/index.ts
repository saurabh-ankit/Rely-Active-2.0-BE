import { Router } from 'express'
import residentAuthRouter from './residentAuth.routes.js'
import fnbMobileRouter from './fnbMobile.routes.js'
import ticketMobileRouter from './ticketMobile.routes.js'
import gnsRouter from './gns.routes.js'

export const l1MobileRouter = Router()

// Resident Auth (/api/v1/mobile/l1/resident/auth & /api/v1/mobile/l1/auth)
l1MobileRouter.use('/resident/auth', residentAuthRouter)
l1MobileRouter.use('/auth', residentAuthRouter)

// Resident Tickets (/api/v1/mobile/l1/tickets)
l1MobileRouter.use('/tickets', ticketMobileRouter)

// Resident Food & Beverage (/api/v1/mobile/l1/fnb)
l1MobileRouter.use('/fnb', fnbMobileRouter)

// Resident Gate & Security (/api/v1/mobile/l1/gns)
l1MobileRouter.use('/gns', gnsRouter)

export default l1MobileRouter
