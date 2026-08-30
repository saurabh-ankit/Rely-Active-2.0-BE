import type { NextFunction, Request, Response } from 'express'

const passThrough = (_req: Request, _res: Response, next: NextFunction) => next()

export const generateTemplateValidation = [passThrough]
