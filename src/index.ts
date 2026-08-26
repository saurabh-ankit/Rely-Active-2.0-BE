import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { createApp } from './app.js'
import { corsOrigins, env } from './config/env.js'
import { logger } from './config/logger.js'

const server = createServer(createApp())
const io = new Server(server, { cors: { origin: corsOrigins, credentials: true } })
io.on('connection', (socket) => socket.emit('system:ready', { service: 'rely-active-backend' }))
server.listen(env.PORT, () => logger.info({ port: env.PORT }, 'Rely Active API listening'))

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
