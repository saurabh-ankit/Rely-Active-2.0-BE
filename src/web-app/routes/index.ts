import { Router } from 'express'
import { authRouter } from './auth.routes.js'
import companyRouter from './company.routes.js'
import propertyRouter from './property.routes.js'

export const apiRouter = Router()
apiRouter.get('/', (_request, response) =>
  response.json({ success: true, data: { name: 'Rely Active API', version: 'v1' } }),
)
apiRouter.use('/auth', authRouter)
apiRouter.use('/company', companyRouter)
apiRouter.use('/property', propertyRouter)


