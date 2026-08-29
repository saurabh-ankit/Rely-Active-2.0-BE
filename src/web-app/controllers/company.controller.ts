import type { NextFunction, Request, Response } from 'express'
import type { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { Company, CompanyCustomField } from '../../models/index.js'
import { validateCompanyCreateInput, validateCompanyUpdateInput } from '../../validations/company.validation.js'

interface CustomFieldInput {
  fieldName?: string
  fieldLabel?: string
  fieldType?: 'text' | 'number' | 'date' | 'select' | 'bool' | 'document'
  fieldValue?: string | number | boolean
  enumValues?: string[]
  displayOrder?: number
  defaultValue?: string
}

export const createCompany = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      company_name,
      gst_number,
      company_gst_number,
      email,
      email_id,
      contact_number,
      alternate_contact_number,
      head_office_address,
      company_head_office_address,
      document_description,
      bank_name,
      branch_name,
      account_no,
      ifsc_code,
      accountant_name,
      customFields,
    } = req.body

    const validationError = validateCompanyCreateInput(req.body)
    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      })
    }

    const finalCompanyName = company_name
    const finalEmail = email || email_id
    const finalContact = contact_number
    const finalAddress = head_office_address || company_head_office_address
    const finalGst = gst_number || company_gst_number

    let document_url = ''
    let document_name = ''
    if (req.files && typeof req.files === 'object' && 'document' in req.files) {
      const files = req.files['document'] as Express.Multer.File[]
      if (files[0]) {
        document_url = `/uploads/${files[0].filename}`
        document_name = files[0].originalname
      }
    }

    let accountant_signature_url = ''
    if (req.files && typeof req.files === 'object' && 'accountant_signature' in req.files) {
      const files = req.files['accountant_signature'] as Express.Multer.File[]
      if (files[0]) {
        accountant_signature_url = `/uploads/${files[0].filename}`
      }
    }

    const operatingUserId = (req as AuthenticatedRequest).user?.id || null

    const company = await Company.create({
      company_name: finalCompanyName,
      company_gst_number: finalGst,
      email_id: finalEmail,
      contact_number: finalContact,
      alternate_contact_number,
      company_head_office_address: finalAddress,
      document_name,
      document_path: document_url,
      document_description,
      bank_name,
      branch_name,
      account_no,
      ifsc_code,
      accountant_name,
      accountant_signature: accountant_signature_url,
      isActive: true,
      isDeleted: false,
      createdBy: operatingUserId,
      updatedBy: operatingUserId,
    })

    if (customFields) {
      let parsedCustomFields: CustomFieldInput[] = []
      if (typeof customFields === 'string' && customFields.trim() !== '') {
        try {
          parsedCustomFields = JSON.parse(customFields)
        } catch {
          return res.status(400).json({
            success: false,
            message: 'Invalid customFields JSON format',
          })
        }
      } else if (Array.isArray(customFields)) {
        parsedCustomFields = customFields as CustomFieldInput[]
      }

      for (const field of parsedCustomFields) {
        const fieldName = String(field.fieldName || '').trim()
        if (!fieldName) continue

        let fieldValue: string | null = field.fieldValue ? String(field.fieldValue) : null

        if (field.fieldType === 'document') {
          if (req.files && typeof req.files === 'object' && 'documents' in req.files) {
            const documents = req.files['documents'] as Express.Multer.File[]
            const docFields = parsedCustomFields.filter((f) => f.fieldType === 'document')
            const idx = docFields.findIndex((f) => f.fieldName === fieldName)
            if (idx >= 0 && idx < documents.length && documents[idx]) {
              fieldValue = `/uploads/${documents[idx].filename}`
            }
          }
        }

        await CompanyCustomField.create({
          companyId: company.id,
          fieldName,
          fieldLabel: String(field.fieldLabel || fieldName).trim(),
          fieldType: field.fieldType || 'text',
          fieldValue,
          enumValues: Array.isArray(field.enumValues) ? field.enumValues : null,
          displayOrder: field.displayOrder ? Number(field.displayOrder) : 0,
          defaultValue: field.defaultValue ? String(field.defaultValue) : null,
          isActive: true,
          isDeleted: false,
          createdBy: operatingUserId,
          updatedBy: operatingUserId,
        })
      }
    }

    const companyWithDetails = await Company.findByPk(company.id, {
      include: [
        {
          model: CompanyCustomField,
          as: 'customFields',
          where: { isDeleted: false },
          required: false,
        },
      ],
    })

    return res.status(201).json({
      success: true,
      message: 'Company created successfully',
      data: companyWithDetails,
    })
  } catch (error) {
    next(error)
  }
}

export const getAllCompanies = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const companies = await Company.findAll({
      where: { isDeleted: false },
      include: [
        {
          model: CompanyCustomField,
          as: 'customFields',
          where: { isDeleted: false },
          required: false,
        },
      ],
    })

    return res.status(200).json({
      success: true,
      message: 'Companies fetched successfully',
      data: companies,
    })
  } catch (error) {
    next(error)
  }
}

export const getCompanyById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    if (!id) {
      return res.status(400).json({ success: false, message: 'Company ID is required' })
    }

    const company = await Company.findOne({
      where: { id, isDeleted: false },
      include: [
        {
          model: CompanyCustomField,
          as: 'customFields',
          where: { isDeleted: false },
          required: false,
        },
      ],
    })

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Company fetched successfully',
      data: company,
    })
  } catch (error) {
    next(error)
  }
}

export const updateCompany = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    if (!id) {
      return res.status(400).json({ success: false, message: 'Company ID is required' })
    }

    const existing = await Company.findOne({ where: { id, isDeleted: false } })

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
      })
    }

    const operatingUserId = (req as AuthenticatedRequest).user?.id || null
    const { customFields, locationId, ...companyFields } = req.body
    void locationId
    const updates: Record<string, unknown> = { ...companyFields, updatedBy: operatingUserId }

    if (updates.gst_number) updates.company_gst_number = updates.gst_number
    if (updates.email) updates.email_id = updates.email
    if (updates.head_office_address) updates.company_head_office_address = updates.head_office_address

    const validationError = validateCompanyUpdateInput(updates, existing)
    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      })
    }

    if (req.files && typeof req.files === 'object' && 'document' in req.files) {
      const files = req.files['document'] as Express.Multer.File[]
      if (files[0]) {
        updates.document_path = `/uploads/${files[0].filename}`
        updates.document_name = files[0].originalname
      }
    }

    if (req.files && typeof req.files === 'object' && 'accountant_signature' in req.files) {
      const files = req.files['accountant_signature'] as Express.Multer.File[]
      if (files[0]) {
        updates.accountant_signature = `/uploads/${files[0].filename}`
      }
    }

    await existing.update(updates)

    if (customFields !== undefined) {
      let parsedCustomFields: CustomFieldInput[] = []
      if (typeof customFields === 'string') {
        try {
          if (customFields.trim() !== '' && customFields.trim() !== '[]') {
            parsedCustomFields = JSON.parse(customFields)
          }
        } catch {
          return res.status(400).json({
            success: false,
            message: 'Invalid customFields JSON format',
          })
        }
      } else if (Array.isArray(customFields)) {
        parsedCustomFields = customFields as CustomFieldInput[]
      }

      await CompanyCustomField.destroy({
        where: { companyId: id },
      })

      for (const field of parsedCustomFields) {
        const fieldName = String(field.fieldName || '').trim()
        if (!fieldName) continue

        let fieldValue: string | null = field.fieldValue ? String(field.fieldValue) : null

        if (field.fieldType === 'document') {
          if (req.files && typeof req.files === 'object' && 'documents' in req.files) {
            const documents = req.files['documents'] as Express.Multer.File[]
            const docFields = parsedCustomFields.filter((f) => f.fieldType === 'document')
            const idx = docFields.findIndex((f) => f.fieldName === fieldName)
            if (idx >= 0 && idx < documents.length && documents[idx]) {
              fieldValue = `/uploads/${documents[idx].filename}`
            }
          }
        }

        await CompanyCustomField.create({
          companyId: id,
          fieldName,
          fieldLabel: String(field.fieldLabel || fieldName).trim(),
          fieldType: field.fieldType || 'text',
          fieldValue,
          enumValues: Array.isArray(field.enumValues) ? field.enumValues : null,
          displayOrder: field.displayOrder ? Number(field.displayOrder) : 0,
          defaultValue: field.defaultValue ? String(field.defaultValue) : null,
          isActive: true,
          isDeleted: false,
          createdBy: operatingUserId,
          updatedBy: operatingUserId,
        })
      }
    }

    const updatedCompany = await Company.findByPk(id, {
      include: [
        {
          model: CompanyCustomField,
          as: 'customFields',
          where: { isDeleted: false },
          required: false,
        },
      ],
    })

    return res.status(200).json({
      success: true,
      message: 'Company updated successfully',
      data: updatedCompany,
    })
  } catch (error) {
    next(error)
  }
}

export const deleteCompany = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    if (!id) {
      return res.status(400).json({ success: false, message: 'Company ID is required' })
    }

    const company = await Company.findOne({ where: { id, isDeleted: false } })

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
      })
    }

    const operatingUserId = (req as AuthenticatedRequest).user?.id || null
    await company.update({ isDeleted: true, updatedBy: operatingUserId })
    return res.status(200).json({
      success: true,
      message: 'Company deleted successfully',
    })
  } catch (error) {
    next(error)
  }
}

export const checkSuperAdminSetupStatus = async () => {
  const companyCount = await Company.count({
    where: { isDeleted: false },
  })

  const hasCompany = companyCount > 0
  const needsSetup = !hasCompany
  const setupStep = !hasCompany ? 1 : 0
  const message = !hasCompany ? 'Please create a company to get started' : 'Setup is complete'

  return {
    needsSetup,
    setupStep,
    message,
    hasCompany,
    hasLocation: true,
  }
}

export const getSetupStatus = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await checkSuperAdminSetupStatus()
    return res.status(200).json({
      success: true,
      message: 'Setup status retrieved successfully',
      data: status,
    })
  } catch (error) {
    next(error)
  }
}
