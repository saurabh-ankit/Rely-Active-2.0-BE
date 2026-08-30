import type { NextFunction, Request, Response } from 'express'

const passThrough = (_req: Request, _res: Response, next: NextFunction) => next()

export const createAssetValidation = [passThrough]
export const updateAssetValidation = [passThrough]
export const getAssetByIdValidation = [passThrough]
export const deleteAssetValidation = [passThrough]
export const getAssetsValidation = [passThrough]
