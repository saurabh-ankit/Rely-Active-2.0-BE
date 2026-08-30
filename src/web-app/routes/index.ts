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
import assetRouter from './asset/index.js'

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
apiRouter.use('/residents', residentRouter)
apiRouter.use('/assets', assetRouter)
apiRouter.use('/location/:locationId/assets', assetRouter)
