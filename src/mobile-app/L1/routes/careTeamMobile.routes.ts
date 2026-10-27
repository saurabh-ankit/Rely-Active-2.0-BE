import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import { getMyCareTeam } from '../controllers/careTeamMobile.controller.js'

const careTeamMobileRouter = Router()
careTeamMobileRouter.use(authenticate)

careTeamMobileRouter.get('/', getMyCareTeam)

export default careTeamMobileRouter
