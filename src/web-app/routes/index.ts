import { Router } from 'express'
import { authRouter } from './auth.routes.js'
import { exampleRouter } from './example.routes.js'

export const apiRouter = Router()
apiRouter.get('/', (_request, response) =>
  response.json({ success: true, data: { name: 'Rely Active API', version: 'v1' } }),
)
apiRouter.use('/auth', authRouter)
apiRouter.use('/examples', exampleRouter)
