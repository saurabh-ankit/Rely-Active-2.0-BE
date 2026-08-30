import type { NextFunction, Request, Response } from 'express'

const passThrough = (_req: Request, _res: Response, next: NextFunction) => next()

export const createServiceLogValidation = [passThrough]
export const getServiceLogsValidation = [passThrough]
export const updateServiceLogValidation = [passThrough]
export const deleteServiceLogValidation = [passThrough]
export const completeServiceLogValidation = [passThrough]

export const createWarrantyValidation = [passThrough]
export const getWarrantiesValidation = [passThrough]
export const updateWarrantyValidation = [passThrough]
export const deleteWarrantyValidation = [passThrough]

export const createCalibrationValidation = [passThrough]
export const getCalibrationsValidation = [passThrough]
export const updateCalibrationValidation = [passThrough]
export const deleteCalibrationValidation = [passThrough]

export const getUpcomingMaintenanceValidation = [passThrough]
