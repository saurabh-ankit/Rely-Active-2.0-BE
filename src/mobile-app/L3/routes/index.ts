import { Router } from 'express'
import gateEntryMobileRouter from './gateEntry.routes.js'

export const l3MobileRouter = Router()

// Health check
l3MobileRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'rely-active-L3-mobile-app' })
})

// L3 Gate Entries (/api/v1/mobile/l3/gate/entries)
l3MobileRouter.use('/gate/entries', gateEntryMobileRouter)

export default l3MobileRouter
