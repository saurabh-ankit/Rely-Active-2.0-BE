import type { NextFunction, Request, Response } from 'express'

const passThrough = (_req: Request, _res: Response, next: NextFunction) => next()

export const createCertificationValidation = [passThrough]
export const getCertificationsValidation = [passThrough]
export const updateCertificationValidation = [passThrough]
export const deleteCertificationValidation = [passThrough]

export const createInspectionValidation = [passThrough]
export const getInspectionsValidation = [passThrough]
export const updateInspectionValidation = [passThrough]
export const deleteInspectionValidation = [passThrough]

export const createTrainingValidation = [passThrough]
export const getTrainingValidation = [passThrough]
export const updateTrainingValidation = [passThrough]
export const deleteTrainingValidation = [passThrough]

export const getComplianceStatusValidation = [passThrough]
export const getExpiringCertificationsValidation = [passThrough]
