import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { Op, type Includeable, type IncludeOptions } from 'sequelize'
import {
  Asset,
  AssetComplianceCertification,
  AssetComplianceInspection,
  AssetComplianceTraining,
  AssetItem,
  Property,
} from '../../../models/index.js'
import { AppError } from '../../../utils/appError.js'
import { errorResponse, successResponse } from '../../../utils/response/index.js'
import { uploadFileToS3, uploadBase64ToS3 } from '../../../middlewares/s3/index.js'

// ==================== CERTIFICATION CONTROLLERS ====================

export const createCertification = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      assetId,
      certificationType,
      certificateNumber,
      issuingAuthority,
      issueDate,
      expiryDate,
      status,
      documentUrl,
    } = req.body

    const asset = await Asset.findByPk(assetId)
    if (!asset) {
      throw new AppError('Asset not found', 404)
    }

    let finalDocUrl: string | null = documentUrl || null
    if (req.file) {
      const s3Res = await uploadFileToS3(req.file, 'assets/certifications')
      finalDocUrl = s3Res.location
    } else if (finalDocUrl) {
      finalDocUrl = await uploadBase64ToS3(finalDocUrl, 'assets/certifications')
    }

    const certification = await AssetComplianceCertification.create({
      assetId,
      certificationType,
      certificateNumber,
      issuingAuthority,
      issueDate,
      expiryDate,
      status,
      documentUrl: finalDocUrl,
      createdBy: req.user?.id || null,
    })

    const createdCertification = await AssetComplianceCertification.findByPk(certification.id, {
      include: [
        {
          model: Asset,
          as: 'asset',
          include: [
            {
              model: AssetItem,
              as: 'item',
              attributes: ['id', 'name', 'model'],
            },
          ],
        },
      ],
    })

    return res.status(201).json(successResponse('Certification created successfully', createdCertification))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error creating certification:', error)
    return res.status(500).json(errorResponse('Failed to create certification'))
  }
}

export const getCertifications = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, assetId, status, certificationType } = req.query
    const locationId = req.params.locationId as string | undefined

    const offset = (Number(page) - 1) * Number(limit)
    const whereClause: Record<string, unknown> = {}

    if (assetId) {
      whereClause.assetId = assetId
    }

    if (status) {
      whereClause.status = status
    }

    if (certificationType) {
      whereClause.certificationType = certificationType
    }

    const assetInclude: Includeable = {
      model: Asset,
      as: 'asset',
      include: [
        {
          model: AssetItem,
          as: 'item',
          attributes: ['id', 'name', 'model'],
        },
        {
          model: Property,
          as: 'location',
          attributes: ['id', 'property_name'],
        },
      ],
    }

    if (locationId && locationId !== 'all') {
      assetInclude.where = { locationId }
    }

    const { rows: certifications, count } = await AssetComplianceCertification.findAndCountAll({
      where: whereClause,
      include: [assetInclude],
      limit: Number(limit),
      offset,
      order: [['expiryDate', 'ASC']],
      distinct: true,
    })

    return res.status(200).json(
      successResponse('Certifications retrieved successfully', {
        certifications,
        pagination: {
          total: count,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(count / Number(limit)),
        },
      }),
    )
  } catch (error) {
    console.error('Error retrieving certifications:', error)
    return res.status(500).json(errorResponse('Failed to retrieve certifications'))
  }
}

export const updateCertification = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const { certificationType, certificateNumber, issuingAuthority, issueDate, expiryDate, status, documentUrl } =
      req.body

    const certification = await AssetComplianceCertification.findByPk(id)
    if (!certification) {
      throw new AppError('Certification not found', 404)
    }

    let finalDocUrl = certification.documentUrl
    if (req.file) {
      const s3Res = await uploadFileToS3(req.file, 'assets/certifications')
      finalDocUrl = s3Res.location
    } else if (documentUrl !== undefined) {
      finalDocUrl = await uploadBase64ToS3(documentUrl, 'assets/certifications')
    }

    await certification.update({
      ...(certificationType && { certificationType }),
      ...(certificateNumber !== undefined && { certificateNumber }),
      ...(issuingAuthority !== undefined && { issuingAuthority }),
      ...(issueDate && { issueDate }),
      ...(expiryDate && { expiryDate }),
      ...(status && { status }),
      documentUrl: finalDocUrl,
      updatedBy: req.user?.id || null,
    })

    const updatedCertification = await AssetComplianceCertification.findByPk(id, {
      include: [
        {
          model: Asset,
          as: 'asset',
          include: [
            {
              model: AssetItem,
              as: 'item',
              attributes: ['id', 'name', 'model'],
            },
          ],
        },
      ],
    })

    return res.status(200).json(successResponse('Certification updated successfully', updatedCertification))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error updating certification:', error)
    return res.status(500).json(errorResponse('Failed to update certification'))
  }
}

export const deleteCertification = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string

    const certification = await AssetComplianceCertification.findByPk(id)
    if (!certification) {
      throw new AppError('Certification not found', 404)
    }

    await certification.destroy()

    return res.status(200).json(successResponse('Certification deleted successfully', null))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error deleting certification:', error)
    return res.status(500).json(errorResponse('Failed to delete certification'))
  }
}

// ==================== INSPECTION CONTROLLERS ====================

export const createInspection = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      assetId,
      inspectionType,
      inspectorName,
      inspectionDate,
      nextInspectionDate,
      result,
      findings,
      recommendations,
      documentUrl,
    } = req.body

    const asset = await Asset.findByPk(assetId)
    if (!asset) {
      throw new AppError('Asset not found', 404)
    }

    let finalDocUrl: string | null = documentUrl || null
    if (req.file) {
      const s3Res = await uploadFileToS3(req.file, 'assets/inspections')
      finalDocUrl = s3Res.location
    } else if (finalDocUrl) {
      finalDocUrl = await uploadBase64ToS3(finalDocUrl, 'assets/inspections')
    }

    const inspection = await AssetComplianceInspection.create({
      assetId,
      inspectionType,
      inspectorName,
      inspectionDate,
      nextInspectionDate,
      result,
      findings,
      recommendations,
      documentUrl: finalDocUrl,
      createdBy: req.user?.id || null,
    })

    const createdInspection = await AssetComplianceInspection.findByPk(inspection.id, {
      include: [
        {
          model: Asset,
          as: 'asset',
          include: [
            {
              model: AssetItem,
              as: 'item',
              attributes: ['id', 'name', 'model'],
            },
          ],
        },
      ],
    })

    return res.status(201).json(successResponse('Inspection recorded successfully', createdInspection))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error creating inspection:', error)
    return res.status(500).json(errorResponse('Failed to record inspection'))
  }
}

export const getInspections = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, assetId, inspectionType, result } = req.query
    const locationId = req.params.locationId as string | undefined

    const offset = (Number(page) - 1) * Number(limit)
    const whereClause: Record<string, unknown> = {}

    if (assetId) {
      whereClause.assetId = assetId
    }

    if (inspectionType) {
      whereClause.inspectionType = inspectionType
    }

    if (result) {
      whereClause.result = result
    }

    const assetInclude: Includeable = {
      model: Asset,
      as: 'asset',
      include: [
        {
          model: AssetItem,
          as: 'item',
          attributes: ['id', 'name', 'model'],
        },
        {
          model: Property,
          as: 'location',
          attributes: ['id', 'property_name'],
        },
      ],
    }

    if (locationId && locationId !== 'all') {
      assetInclude.where = { locationId }
    }

    const { rows: inspections, count } = await AssetComplianceInspection.findAndCountAll({
      where: whereClause,
      include: [assetInclude],
      limit: Number(limit),
      offset,
      order: [['inspectionDate', 'DESC']],
      distinct: true,
    })

    return res.status(200).json(
      successResponse('Inspections retrieved successfully', {
        inspections,
        pagination: {
          total: count,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(count / Number(limit)),
        },
      }),
    )
  } catch (error) {
    console.error('Error retrieving inspections:', error)
    return res.status(500).json(errorResponse('Failed to retrieve inspections'))
  }
}

export const updateInspection = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const {
      inspectionType,
      inspectorName,
      inspectionDate,
      nextInspectionDate,
      result,
      findings,
      recommendations,
      documentUrl,
    } = req.body

    const inspection = await AssetComplianceInspection.findByPk(id)
    if (!inspection) {
      throw new AppError('Inspection not found', 404)
    }

    let finalDocUrl = inspection.documentUrl
    if (req.file) {
      const s3Res = await uploadFileToS3(req.file, 'assets/inspections')
      finalDocUrl = s3Res.location
    } else if (documentUrl !== undefined) {
      finalDocUrl = await uploadBase64ToS3(documentUrl, 'assets/inspections')
    }

    await inspection.update({
      ...(inspectionType && { inspectionType }),
      ...(inspectorName !== undefined && { inspectorName }),
      ...(inspectionDate && { inspectionDate }),
      ...(nextInspectionDate !== undefined && { nextInspectionDate }),
      ...(result && { result }),
      ...(findings !== undefined && { findings }),
      ...(recommendations !== undefined && { recommendations }),
      documentUrl: finalDocUrl,
      updatedBy: req.user?.id || null,
    })

    const updatedInspection = await AssetComplianceInspection.findByPk(id, {
      include: [
        {
          model: Asset,
          as: 'asset',
          include: [
            {
              model: AssetItem,
              as: 'item',
              attributes: ['id', 'name', 'model'],
            },
          ],
        },
      ],
    })

    return res.status(200).json(successResponse('Inspection updated successfully', updatedInspection))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error updating inspection:', error)
    return res.status(500).json(errorResponse('Failed to update inspection'))
  }
}

export const deleteInspection = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string

    const inspection = await AssetComplianceInspection.findByPk(id)
    if (!inspection) {
      throw new AppError('Inspection not found', 404)
    }

    await inspection.destroy()

    return res.status(200).json(successResponse('Inspection deleted successfully', null))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error deleting inspection:', error)
    return res.status(500).json(errorResponse('Failed to delete inspection'))
  }
}

// ==================== TRAINING CONTROLLERS ====================

export const createTraining = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { assetId, trainingTitle, requiredFor, validityPeriod, notes } = req.body

    const asset = await Asset.findByPk(assetId)
    if (!asset) {
      throw new AppError('Asset not found', 404)
    }

    const training = await AssetComplianceTraining.create({
      assetId,
      trainingTitle,
      requiredFor,
      validityPeriod,
      notes,
      createdBy: req.user?.id || null,
    })

    const createdTraining = await AssetComplianceTraining.findByPk(training.id, {
      include: [
        {
          model: Asset,
          as: 'asset',
          include: [
            {
              model: AssetItem,
              as: 'item',
              attributes: ['id', 'name', 'model'],
            },
          ],
        },
      ],
    })

    return res.status(201).json(successResponse('Training requirement created successfully', createdTraining))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error creating training requirement:', error)
    return res.status(500).json(errorResponse('Failed to create training requirement'))
  }
}

export const getTraining = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, assetId, requiredFor } = req.query
    const locationId = req.params.locationId as string | undefined

    const offset = (Number(page) - 1) * Number(limit)
    const whereClause: Record<string, unknown> = {}

    if (assetId) {
      whereClause.assetId = assetId
    }

    if (requiredFor) {
      whereClause.requiredFor = requiredFor
    }

    const assetInclude: Includeable = {
      model: Asset,
      as: 'asset',
      include: [
        {
          model: AssetItem,
          as: 'item',
          attributes: ['id', 'name', 'model'],
        },
        {
          model: Property,
          as: 'location',
          attributes: ['id', 'property_name'],
        },
      ],
    }

    if (locationId && locationId !== 'all') {
      assetInclude.where = { locationId }
    }

    const { rows: training, count } = await AssetComplianceTraining.findAndCountAll({
      where: whereClause,
      include: [assetInclude],
      limit: Number(limit),
      offset,
      order: [['createdAt', 'DESC']],
      distinct: true,
    })

    return res.status(200).json(
      successResponse('Training requirements retrieved successfully', {
        training,
        pagination: {
          total: count,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(count / Number(limit)),
        },
      }),
    )
  } catch (error) {
    console.error('Error retrieving training requirements:', error)
    return res.status(500).json(errorResponse('Failed to retrieve training requirements'))
  }
}

export const updateTraining = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const { trainingTitle, requiredFor, validityPeriod, notes } = req.body

    const training = await AssetComplianceTraining.findByPk(id)
    if (!training) {
      throw new AppError('Training requirement not found', 404)
    }

    await training.update({
      ...(trainingTitle && { trainingTitle }),
      ...(requiredFor && { requiredFor }),
      ...(validityPeriod !== undefined && { validityPeriod }),
      ...(notes !== undefined && { notes }),
      updatedBy: req.user?.id || null,
    })

    const updatedTraining = await AssetComplianceTraining.findByPk(id, {
      include: [
        {
          model: Asset,
          as: 'asset',
          include: [
            {
              model: AssetItem,
              as: 'item',
              attributes: ['id', 'name', 'model'],
            },
          ],
        },
      ],
    })

    return res.status(200).json(successResponse('Training requirement updated successfully', updatedTraining))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error updating training requirement:', error)
    return res.status(500).json(errorResponse('Failed to update training requirement'))
  }
}

export const deleteTraining = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string

    const training = await AssetComplianceTraining.findByPk(id)
    if (!training) {
      throw new AppError('Training requirement not found', 404)
    }

    await training.destroy()

    return res.status(200).json(successResponse('Training requirement deleted successfully', null))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error deleting training requirement:', error)
    return res.status(500).json(errorResponse('Failed to delete training requirement'))
  }
}

export const getComplianceStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = req.params.locationId as string | undefined
    const { assetId } = req.query

    const whereClause: Record<string, unknown> = {}
    if (assetId) {
      whereClause.assetId = assetId
    }

    const assetInclude: IncludeOptions = {
      model: Asset,
      as: 'asset',
    }

    if (locationId && locationId !== 'all') {
      assetInclude.where = { locationId }
    }

    const validCertifications = await AssetComplianceCertification.count({
      where: { ...whereClause, status: 'valid' },
      include: [assetInclude],
    })

    const expiredCertifications = await AssetComplianceCertification.count({
      where: { ...whereClause, status: 'expired' },
      include: [assetInclude],
    })

    const expiringCertifications = await AssetComplianceCertification.count({
      where: { ...whereClause, status: 'expiring_soon' },
      include: [assetInclude],
    })

    const pendingCertifications = await AssetComplianceCertification.count({
      where: { ...whereClause, status: 'pending_renewal' },
      include: [assetInclude],
    })

    const passedInspections = await AssetComplianceInspection.count({
      where: { ...whereClause, result: 'pass' },
      include: [assetInclude],
    })

    const failedInspections = await AssetComplianceInspection.count({
      where: { ...whereClause, result: 'fail' },
      include: [assetInclude],
    })

    return res.status(200).json(
      successResponse('Compliance status retrieved successfully', {
        certifications: {
          valid: validCertifications,
          expired: expiredCertifications,
          expiringSoon: expiringCertifications,
          pendingRenewal: pendingCertifications,
          total: validCertifications + expiredCertifications + expiringCertifications + pendingCertifications,
        },
        inspections: {
          passed: passedInspections,
          failed: failedInspections,
          total: passedInspections + failedInspections,
        },
      }),
    )
  } catch (error) {
    console.error('Error retrieving compliance status:', error)
    return res.status(500).json(errorResponse('Failed to retrieve compliance status'))
  }
}

export const getExpiringCertifications = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const days = Number(req.query.days || 30)
    const locationId = req.params.locationId as string | undefined

    const today = new Date()
    const targetDate = new Date()
    targetDate.setDate(today.getDate() + days)

    const assetInclude: Includeable = {
      model: Asset,
      as: 'asset',
      include: [
        {
          model: AssetItem,
          as: 'item',
          attributes: ['id', 'name', 'model'],
        },
        {
          model: Property,
          as: 'location',
          attributes: ['id', 'property_name'],
        },
      ],
    }

    if (locationId && locationId !== 'all') {
      assetInclude.where = { locationId }
    }

    const expiringCertifications = await AssetComplianceCertification.findAll({
      where: {
        expiryDate: {
          [Op.between]: [today, targetDate],
        },
      },
      include: [assetInclude],
      order: [['expiryDate', 'ASC']],
    })

    return res
      .status(200)
      .json(successResponse('Expiring certifications retrieved successfully', expiringCertifications))
  } catch (error) {
    console.error('Error retrieving expiring certifications:', error)
    return res.status(500).json(errorResponse('Failed to retrieve expiring certifications'))
  }
}
