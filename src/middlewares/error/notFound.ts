import type { RequestHandler } from 'express'

export const notFound: RequestHandler = (request, response) => {
  response.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.path} was not found` },
  })
}
