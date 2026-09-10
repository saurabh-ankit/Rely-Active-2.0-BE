import type { ErrorRequestHandler } from 'express'
import { ZodError } from 'zod'
import { logger } from '../../config/logger.js'

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
  }
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof ZodError)
    return void response.status(422).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: error.flatten() },
    })
  if (error instanceof HttpError)
    return void response
      .status(error.status)
      .json({ success: false, error: { code: 'REQUEST_ERROR', message: error.message, details: error.details } })

  const errObj = error instanceof Error ? error : new Error(String(error || 'Unhandled request error'))
  logger.error({ err: errObj }, errObj.message || 'Unhandled request error')
  response.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: errObj.message || 'An unexpected error occurred' },
  })
}
