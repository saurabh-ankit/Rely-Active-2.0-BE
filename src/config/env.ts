import 'dotenv/config'
import { z } from 'zod'

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174'),
  DATABASE_URL: z.string().default('mysql://rely:rely@localhost:3306/rely_active'),
  JWT_SECRET: z.string().min(32).default('development-only-secret-change-me-now'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_BUCKET: z.string().default(''),
  SMTP_URL: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
})

export const env = environmentSchema.parse(process.env)
export const corsOrigins = env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
