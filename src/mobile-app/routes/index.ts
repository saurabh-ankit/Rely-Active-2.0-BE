import { Router } from 'express'
import residentAuthRouter from './residentAuth.routes.js'
import fnbMobileRouter from './fnbMobile.routes.js'

export const mobileApiRouter = Router()

mobileApiRouter.use('/resident/auth', residentAuthRouter)
mobileApiRouter.use('/fnb', fnbMobileRouter)
