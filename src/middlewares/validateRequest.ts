import type { NextFunction, Request, Response } from 'express'

export const validateRequest = (_req: Request, _res: Response, next: NextFunction) => {
  return next()
}
