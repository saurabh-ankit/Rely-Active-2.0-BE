import type { NextFunction, Request, Response } from 'express'

const passThrough = (_req: Request, _res: Response, next: NextFunction) => next()

export const createCategoryValidation = [passThrough]
export const updateCategoryValidation = [passThrough]
export const getCategoryByIdValidation = [passThrough]
export const deleteCategoryValidation = [passThrough]
export const getCategoriesValidation = [passThrough]
