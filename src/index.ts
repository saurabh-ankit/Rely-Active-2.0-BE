import 'dotenv/config'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { createApp } from './app.js'

import sequelize from './config/db/index.js'
import { logger } from './config/logger.js'
import './models/index.js'

const port = Number(process.env.PORT) || 3002
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((origin) => origin.trim())

const server = createServer(createApp())
const io = new Server(server, { cors: { origin: corsOrigins, credentials: true } })
io.on('connection', (socket) => socket.emit('system:ready', { service: 'rely-active-backend' }))

async function startServer() {
  try {
    await sequelize.authenticate()
    console.log('✅ Database connected successfully!')
    logger.info('Database connection established successfully')
    await sequelize.sync()
    console.log('✅ Database models synchronized successfully!')
    logger.info('Database models synchronized successfully')
  } catch (error) {
    console.error('⚠️ Database connection or sync failed:', error)
    logger.warn({ error }, 'Database connection or sync deferred/failed')
  }

  server.listen(port, () => {
    console.log(`🚀 Server started running on port http://localhost:${port}`)
    logger.info({ port }, 'Rely Active API listening')
  })
}

startServer()

function shutdown(signal: string) {
  logger.info({ signal }, 'Graceful shutdown started')
  io.close()
  server.close((error) => {
    if (error) {
      logger.error({ error }, 'Shutdown failed')
      process.exitCode = 1
    }
  })
}
process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT', () => shutdown('SIGINT'))
