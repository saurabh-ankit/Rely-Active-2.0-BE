import type { NextFunction, Request, Response } from 'express'
import type { ZodSchema } from 'zod'

export const validateBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const issue = result.error.issues[0]
      const message = issue ? issue.message : 'Validation failed'
      return res.status(400).json({
        success: false,
        message,
        errors: result.error.issues.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      })
    }
    req.body = result.data
    return next()
  }
}

export const validateParams = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params)
    if (!result.success) {
      const issue = result.error.issues[0]
      const message = issue ? issue.message : 'Invalid parameter'
      return res.status(400).json({
        success: false,
        message,
        errors: result.error.issues.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      })
    }
    req.params = result.data as Record<string, string>
    return next()
  }
}

export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query)
    if (!result.success) {
      const issue = result.error.issues[0]
      const message = issue ? issue.message : 'Invalid query parameters'
      return res.status(400).json({
        success: false,
        message,
        errors: result.error.issues.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      })
    }
    req.query = result.data as Request['query']
    return next()
  }
}
