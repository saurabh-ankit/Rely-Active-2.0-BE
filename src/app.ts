import 'dotenv/config'
import path from 'node:path'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import { logger } from './config/logger.js'
import { errorHandler } from './middlewares/error/errorHandler.js'
import { notFound } from './middlewares/error/notFound.js'
import { apiRouter } from './web-app/routes/index.js'

const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((origin) => origin.trim())

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  )
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true)
        if (
          corsOrigins.includes(origin) ||
          origin.startsWith('http://localhost:') ||
          origin.startsWith('http://127.0.0.1:')
        ) {
          return callback(null, true)
        }
        return callback(null, true)
      },
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true, limit: '10mb' }))
  app.use(pinoHttp({ logger }))

  // Static uploads directory
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))

  app.get('/health', (_request, response) => response.json({ status: 'ok', service: 'rely-active-backend' }))
  app.use('/api/v1', apiRouter)
  app.use(notFound)
  app.use(errorHandler)
  return app
}
