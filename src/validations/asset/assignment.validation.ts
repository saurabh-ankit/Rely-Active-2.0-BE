import type { NextFunction, Request, Response } from 'express'

const passThrough = (_req: Request, _res: Response, next: NextFunction) => next()

export const createAssignmentValidation = [passThrough]
export const getAssignmentsValidation = [passThrough]
export const getAssignmentByIdValidation = [passThrough]
export const updateAssignmentValidation = [passThrough]
export const deleteAssignmentValidation = [passThrough]
export const returnAssetValidation = [passThrough]
export const getActiveAssignmentsValidation = [passThrough]
export const assignAssetValidation = [passThrough]
export const getAssigneesValidation = [passThrough]
