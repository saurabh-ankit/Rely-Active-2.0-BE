import type { NextFunction, Request, Response } from 'express'

const passThrough = (_req: Request, _res: Response, next: NextFunction) => next()

export const createItemValidation = [passThrough]
export const updateItemValidation = [passThrough]
export const getItemByIdValidation = [passThrough]
export const deleteItemValidation = [passThrough]
export const getItemsValidation = [passThrough]
