import { Router } from 'express'
import { l1MobileRouter } from '../L1/routes/index.js'
import { l3MobileRouter } from '../L3/routes/index.js'

export const mobileApiRouter = Router()

// L1 Resident Mobile App routes mounted strictly under /l1
mobileApiRouter.use('/l1', l1MobileRouter)

// L3 Staff / Technician Mobile App routes mounted strictly under /l3
mobileApiRouter.use('/l3', l3MobileRouter)

export default mobileApiRouter
