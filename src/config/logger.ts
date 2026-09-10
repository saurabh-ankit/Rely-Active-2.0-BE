import 'dotenv/config'
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: ['req.headers.authorization', 'password', 'token'],
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
})
