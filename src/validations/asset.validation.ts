import type { NextFunction, Request, Response } from 'express'
import { errorResponse } from '../utils/response/index.js'
import { EMAIL_REGEX, PHONE_REGEX } from './company.validation.js'

const passThrough = (_req: Request, _res: Response, next: NextFunction) => next()

// Vendor Validations
const validateCreateVendor = (req: Request, res: Response, next: NextFunction) => {
  const { name, categoryId, phone, email } = req.body

  if (!name || !String(name).trim()) {
    return res.status(400).json(errorResponse('Vendor name is required'))
  }

  if (!categoryId || !String(categoryId).trim()) {
    return res.status(400).json(errorResponse('Category is required'))
  }

  if (phone) {
    const cleanPhone = String(phone).trim()
    if (!PHONE_REGEX.test(cleanPhone)) {
      return res.status(400).json(errorResponse('Phone number must be a 10-digit number starting with 6, 7, 8, or 9'))
    }
  }

  if (email) {
    const cleanEmail = String(email).trim()
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json(errorResponse('Please enter a valid email address'))
    }
  }

  return next()
}

const validateUpdateVendor = (req: Request, res: Response, next: NextFunction) => {
  const { phone, email } = req.body

  if (phone) {
    const cleanPhone = String(phone).trim()
    if (!PHONE_REGEX.test(cleanPhone)) {
      return res.status(400).json(errorResponse('Phone number must be a 10-digit number starting with 6, 7, 8, or 9'))
    }
  }

  if (email) {
    const cleanEmail = String(email).trim()
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json(errorResponse('Please enter a valid email address'))
    }
  }

  return next()
}

export const createVendorValidation = [validateCreateVendor]
export const updateVendorValidation = [validateUpdateVendor]
export const getVendorByIdValidation = [passThrough]
export const deleteVendorValidation = [passThrough]
export const getVendorsValidation = [passThrough]

// Category Validations
export const createCategoryValidation = [passThrough]
export const updateCategoryValidation = [passThrough]
export const getCategoryByIdValidation = [passThrough]
export const deleteCategoryValidation = [passThrough]
export const getCategoriesValidation = [passThrough]

// Item Validations
export const createItemValidation = [passThrough]
export const updateItemValidation = [passThrough]
export const getItemByIdValidation = [passThrough]
export const deleteItemValidation = [passThrough]
export const getItemsValidation = [passThrough]

// Asset Validations
export const createAssetValidation = [passThrough]
export const updateAssetValidation = [passThrough]
export const getAssetByIdValidation = [passThrough]
export const deleteAssetValidation = [passThrough]
export const getAssetsValidation = [passThrough]

// Assignment Validations
export const createAssignmentValidation = [passThrough]
export const getAssignmentsValidation = [passThrough]
export const getAssignmentByIdValidation = [passThrough]
export const updateAssignmentValidation = [passThrough]
export const deleteAssignmentValidation = [passThrough]
export const returnAssetValidation = [passThrough]
export const getActiveAssignmentsValidation = [passThrough]
export const assignAssetValidation = [passThrough]
export const getAssigneesValidation = [passThrough]

// Maintenance Validations
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

// Compliance Validations
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

// Bulk Validations
export const generateTemplateValidation = [passThrough]
