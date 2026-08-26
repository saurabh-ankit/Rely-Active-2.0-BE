import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import { corsOrigins } from './config/env.js'
import { logger } from './config/logger.js'
import { errorHandler } from './middlewares/error/errorHandler.js'
import { notFound } from './middlewares/error/notFound.js'
import { apiRouter } from './web-app/routes/index.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({ origin: corsOrigins, credentials: true }))
  app.use(express.json({ limit: '1mb' }))
  app.use(pinoHttp({ logger }))
  app.get('/health', (_request, response) => response.json({ status: 'ok', service: 'rely-active-backend' }))
  app.use('/api/v1', apiRouter)
  app.use(notFound)
  app.use(errorHandler)
  return app
}
