import { Router } from 'express'
import staffAuthRouter from './staffAuth.routes.js'

export const l3MobileRouter = Router()

// Health check
l3MobileRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'rely-active-L3-mobile-app' })
})

// Staff Auth (/api/v1/mobile/l3/auth & /api/v1/mobile/l3/staff/auth)
l3MobileRouter.use('/auth', staffAuthRouter)
l3MobileRouter.use('/staff/auth', staffAuthRouter)

export default l3MobileRouter
