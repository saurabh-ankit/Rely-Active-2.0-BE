import { Router } from 'express'
import authRouter from './auth.routes.js'
import companyRouter from './company.routes.js'
import propertyRouter from './property.routes.js'
import userRouter from './user.routes.js'
import roleRouter from './role.routes.js'
import permissionRouter from './permission.routes.js'
import departmentRouter from './department.routes.js'
import resourceRouter from './resource.routes.js'
import residentRouter from './resident.routes.js'
import assetRouter from './asset.routes.js'
import fnbRouter from './fnb.routes.js'
import ticketRouter from './ticket.routes.js'
import { eventRouter, venueRouter, globalServiceRouter } from './event.routes.js'

export const apiRouter = Router()

apiRouter.get('/', (_request, response) =>
  response.json({ success: true, data: { name: 'Rely Active API', version: 'v1' } }),
)

apiRouter.use('/auth', authRouter)
apiRouter.use('/users', userRouter)
apiRouter.use('/roles', roleRouter)
apiRouter.use('/permissions', permissionRouter)
apiRouter.use('/resources', resourceRouter)
apiRouter.use('/departments', departmentRouter)
apiRouter.use('/company', companyRouter)
apiRouter.use('/property', propertyRouter)
apiRouter.use('/properties', propertyRouter)
apiRouter.use('/residents', residentRouter)
apiRouter.use('/assets', assetRouter)
apiRouter.use('/location/:locationId/assets', assetRouter)
apiRouter.use('/tickets', ticketRouter)
apiRouter.use('/location/:locationId/tickets', ticketRouter)
apiRouter.use('/fnb', fnbRouter)
apiRouter.use('/web/fnb', fnbRouter)
apiRouter.use('/events', eventRouter)
apiRouter.use('/location/:locationId/events', eventRouter)
apiRouter.use('/venues', venueRouter)
apiRouter.use('/location/:locationId/venues', venueRouter)
apiRouter.use('/global-services', globalServiceRouter)
apiRouter.use('/location/:locationId/global-services', globalServiceRouter)

export default apiRouter
