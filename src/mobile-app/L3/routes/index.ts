import { Router } from 'express'

export const l3MobileRouter = Router()

// Placeholder for L3 (Staff / Maintenance App) routes
l3MobileRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'rely-active-L3-mobile-app' })
})

export default l3MobileRouter
