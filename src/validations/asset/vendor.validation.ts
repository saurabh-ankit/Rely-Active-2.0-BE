import type { NextFunction, Request, Response } from 'express'
import { errorResponse } from '../../utils/response/index.js'
import { EMAIL_REGEX, PHONE_REGEX } from '../company.validation.js'

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

const passThrough = (_req: Request, _res: Response, next: NextFunction) => next()

export const createVendorValidation = [validateCreateVendor]
export const updateVendorValidation = [validateUpdateVendor]
export const getVendorByIdValidation = [passThrough]
export const deleteVendorValidation = [passThrough]
export const getVendorsValidation = [passThrough]
