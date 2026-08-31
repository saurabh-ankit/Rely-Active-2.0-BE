import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { Op, type IncludeOptions } from 'sequelize'
import {
  Asset,
  AssetCalibration,
  AssetItem,
  AssetServiceLog,
  AssetVendor,
  AssetWarranty,
  Property,
} from '../../../models/index.js'
import { AppError } from '../../../utils/appError.js'
import { errorResponse, successResponse } from '../../../utils/response/index.js'
import { uploadFileToS3, uploadBase64ToS3 } from '../../../middlewares/s3/index.js'

// ==================== SERVICE LOG CONTROLLERS ====================

export const createServiceLog = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { assetId, serviceDate, serviceType, performedBy, vendorId, cost, description, nextServiceDate } = req.body

    const asset = await Asset.findByPk(assetId)
    if (!asset) {
      throw new AppError('Asset not found', 404)
    }

    if (vendorId) {
      const vendor = await AssetVendor.findByPk(vendorId)
      if (!vendor) {
        throw new AppError('Vendor not found', 404)
      }
    }

    const serviceLog = await AssetServiceLog.create({
      assetId,
      serviceDate,
      serviceType,
      performedBy,
      vendorId: vendorId || null,
      cost,
      description,
      nextServiceDate,
      completionStatus: 'pending',
      createdBy: req.user?.id || null,
    })

    const createdLog = await AssetServiceLog.findByPk(serviceLog.id, {
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
        {
          model: AssetVendor,
          as: 'vendor',
          attributes: ['id', 'name'],
        },
      ],
    })

    return res.status(201).json(successResponse('Service log created successfully', createdLog))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error creating service log:', error)
    return res.status(500).json(errorResponse('Failed to create service log'))
  }
}

export const getServiceLogs = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, assetId, serviceType } = req.query
    const locationId = req.params.locationId as string | undefined

    const offset = (Number(page) - 1) * Number(limit)
    const whereClause: Record<string, unknown> = {}

    if (assetId) {
      whereClause.assetId = assetId
    }

    if (serviceType) {
      whereClause.serviceType = serviceType
    }

    const assetInclude: IncludeOptions = {
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

    const { rows: serviceLogs, count } = await AssetServiceLog.findAndCountAll({
      where: whereClause,
      include: [
        assetInclude,
        {
          model: AssetVendor,
          as: 'vendor',
          attributes: ['id', 'name'],
        },
      ],
      limit: Number(limit),
      offset,
      order: [['serviceDate', 'DESC']],
      distinct: true,
    })

    return res.status(200).json(
      successResponse('Service logs retrieved successfully', {
        serviceLogs,
        pagination: {
          total: count,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(count / Number(limit)),
        },
      }),
    )
  } catch (error) {
    console.error('Error retrieving service logs:', error)
    return res.status(500).json(errorResponse('Failed to retrieve service logs'))
  }
}

export const updateServiceLog = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const { serviceDate, serviceType, performedBy, vendorId, cost, description, nextServiceDate } = req.body

    const serviceLog = await AssetServiceLog.findByPk(id)
    if (!serviceLog) {
      throw new AppError('Service log not found', 404)
    }

    await serviceLog.update({
      ...(serviceDate && { serviceDate }),
      ...(serviceType && { serviceType }),
      ...(performedBy !== undefined && { performedBy }),
      ...(vendorId !== undefined && { vendorId: vendorId || null }),
      ...(cost !== undefined && { cost }),
      ...(description !== undefined && { description }),
      ...(nextServiceDate !== undefined && { nextServiceDate }),
      updatedBy: req.user?.id || null,
    })

    const updatedLog = await AssetServiceLog.findByPk(id, {
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
        {
          model: AssetVendor,
          as: 'vendor',
          attributes: ['id', 'name'],
        },
      ],
    })

    return res.status(200).json(successResponse('Service log updated successfully', updatedLog))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error updating service log:', error)
    return res.status(500).json(errorResponse('Failed to update service log'))
  }
}

export const deleteServiceLog = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string

    const serviceLog = await AssetServiceLog.findByPk(id)
    if (!serviceLog) {
      throw new AppError('Service log not found', 404)
    }

    await serviceLog.destroy()

    return res.status(200).json(successResponse('Service log deleted successfully', null))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error deleting service log:', error)
    return res.status(500).json(errorResponse('Failed to delete service log'))
  }
}

export const completeServiceLog = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const { completionRemarks } = req.body

    const serviceLog = await AssetServiceLog.findByPk(id)
    if (!serviceLog) {
      throw new AppError('Service log not found', 404)
    }

    await serviceLog.update({
      completionStatus: 'completed',
      completedDate: new Date(),
      completionRemarks,
      updatedBy: req.user?.id || null,
    })

    return res.status(200).json(successResponse('Service log completed successfully', serviceLog))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error completing service log:', error)
    return res.status(500).json(errorResponse('Failed to complete service log'))
  }
}

// ==================== WARRANTY CONTROLLERS ====================

export const createWarranty = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { assetId, vendorId, warrantyStartDate, warrantyEndDate, warrantyType, coverageDetails, documentUrl } =
      req.body

    const asset = await Asset.findByPk(assetId)
    if (!asset) {
      throw new AppError('Asset not found', 404)
    }

    let finalDocUrl: string | null = documentUrl || null
    if (req.file) {
      const s3Res = await uploadFileToS3(req.file, 'assets/warranties')
      finalDocUrl = s3Res.location
    } else if (finalDocUrl) {
      finalDocUrl = await uploadBase64ToS3(finalDocUrl, 'assets/warranties')
    }

    const warranty = await AssetWarranty.create({
      assetId,
      vendorId: vendorId || null,
      warrantyStartDate,
      warrantyEndDate,
      warrantyType,
      coverageDetails,
      documentUrl: finalDocUrl,
      createdBy: req.user?.id || null,
    })

    const createdWarranty = await AssetWarranty.findByPk(warranty.id, {
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
        {
          model: AssetVendor,
          as: 'vendor',
          attributes: ['id', 'name'],
        },
      ],
    })

    return res.status(201).json(successResponse('Warranty created successfully', createdWarranty))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error creating warranty:', error)
    return res.status(500).json(errorResponse('Failed to create warranty'))
  }
}

export const getWarranties = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, assetId, status } = req.query
    const locationId = req.params.locationId as string | undefined

    const offset = (Number(page) - 1) * Number(limit)
    const whereClause: Record<string, unknown> = {}

    if (assetId) {
      whereClause.assetId = assetId
    }

    if (status === 'active') {
      whereClause.warrantyEndDate = { [Op.gte]: new Date() }
    } else if (status === 'expired') {
      whereClause.warrantyEndDate = { [Op.lt]: new Date() }
    }

    const assetInclude: IncludeOptions = {
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

    const { rows: warranties, count } = await AssetWarranty.findAndCountAll({
      where: whereClause,
      include: [
        assetInclude,
        {
          model: AssetVendor,
          as: 'vendor',
          attributes: ['id', 'name'],
        },
      ],
      limit: Number(limit),
      offset,
      order: [['warrantyEndDate', 'ASC']],
      distinct: true,
    })

    return res.status(200).json(
      successResponse('Warranties retrieved successfully', {
        warranties,
        pagination: {
          total: count,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(count / Number(limit)),
        },
      }),
    )
  } catch (error) {
    console.error('Error retrieving warranties:', error)
    return res.status(500).json(errorResponse('Failed to retrieve warranties'))
  }
}

export const updateWarranty = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const { vendorId, warrantyStartDate, warrantyEndDate, warrantyType, coverageDetails, documentUrl } = req.body

    const warranty = await AssetWarranty.findByPk(id)
    if (!warranty) {
      throw new AppError('Warranty not found', 404)
    }

    let finalDocUrl = warranty.documentUrl
    if (req.file) {
      const s3Res = await uploadFileToS3(req.file, 'assets/warranties')
      finalDocUrl = s3Res.location
    } else if (documentUrl !== undefined) {
      finalDocUrl = await uploadBase64ToS3(documentUrl, 'assets/warranties')
    }

    await warranty.update({
      ...(vendorId !== undefined && { vendorId: vendorId || null }),
      ...(warrantyStartDate && { warrantyStartDate }),
      ...(warrantyEndDate && { warrantyEndDate }),
      ...(warrantyType && { warrantyType }),
      ...(coverageDetails !== undefined && { coverageDetails }),
      documentUrl: finalDocUrl,
      updatedBy: req.user?.id || null,
    })

    const updatedWarranty = await AssetWarranty.findByPk(id, {
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
        {
          model: AssetVendor,
          as: 'vendor',
          attributes: ['id', 'name'],
        },
      ],
    })

    return res.status(200).json(successResponse('Warranty updated successfully', updatedWarranty))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error updating warranty:', error)
    return res.status(500).json(errorResponse('Failed to update warranty'))
  }
}

export const deleteWarranty = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string

    const warranty = await AssetWarranty.findByPk(id)
    if (!warranty) {
      throw new AppError('Warranty not found', 404)
    }

    await warranty.destroy()

    return res.status(200).json(successResponse('Warranty deleted successfully', null))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error deleting warranty:', error)
    return res.status(500).json(errorResponse('Failed to delete warranty'))
  }
}

// ==================== CALIBRATION CONTROLLERS ====================

export const createCalibration = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      assetId,
      calibrationDate,
      nextCalibrationDate,
      calibratedBy,
      certificateNumber,
      result,
      notes,
      documentUrl,
    } = req.body

    const asset = await Asset.findByPk(assetId)
    if (!asset) {
      throw new AppError('Asset not found', 404)
    }

    let finalDocUrl: string | null = documentUrl || null
    if (req.file) {
      const s3Res = await uploadFileToS3(req.file, 'assets/calibrations')
      finalDocUrl = s3Res.location
    } else if (finalDocUrl) {
      finalDocUrl = await uploadBase64ToS3(finalDocUrl, 'assets/calibrations')
    }

    const calibration = await AssetCalibration.create({
      assetId,
      calibrationDate,
      nextCalibrationDate,
      calibratedBy,
      certificateNumber,
      result,
      notes,
      documentUrl: finalDocUrl,
      createdBy: req.user?.id || null,
    })

    const createdCalibration = await AssetCalibration.findByPk(calibration.id, {
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

    return res.status(201).json(successResponse('Calibration record created successfully', createdCalibration))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error creating calibration:', error)
    return res.status(500).json(errorResponse('Failed to create calibration record'))
  }
}

export const getCalibrations = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, assetId, result } = req.query
    const locationId = req.params.locationId as string | undefined

    const offset = (Number(page) - 1) * Number(limit)
    const whereClause: Record<string, unknown> = {}

    if (assetId) {
      whereClause.assetId = assetId
    }

    if (result) {
      whereClause.result = result
    }

    const assetInclude: IncludeOptions = {
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

    const { rows: calibrations, count } = await AssetCalibration.findAndCountAll({
      where: whereClause,
      include: [assetInclude],
      limit: Number(limit),
      offset,
      order: [['calibrationDate', 'DESC']],
      distinct: true,
    })

    return res.status(200).json(
      successResponse('Calibrations retrieved successfully', {
        calibrations,
        pagination: {
          total: count,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(count / Number(limit)),
        },
      }),
    )
  } catch (error) {
    console.error('Error retrieving calibrations:', error)
    return res.status(500).json(errorResponse('Failed to retrieve calibrations'))
  }
}

export const updateCalibration = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const { calibrationDate, nextCalibrationDate, calibratedBy, certificateNumber, result, notes, documentUrl } =
      req.body

    const calibration = await AssetCalibration.findByPk(id)
    if (!calibration) {
      throw new AppError('Calibration record not found', 404)
    }

    let finalDocUrl = calibration.documentUrl
    if (req.file) {
      const s3Res = await uploadFileToS3(req.file, 'assets/calibrations')
      finalDocUrl = s3Res.location
    } else if (documentUrl !== undefined) {
      finalDocUrl = await uploadBase64ToS3(documentUrl, 'assets/calibrations')
    }

    await calibration.update({
      ...(calibrationDate && { calibrationDate }),
      ...(nextCalibrationDate !== undefined && { nextCalibrationDate }),
      ...(calibratedBy !== undefined && { calibratedBy }),
      ...(certificateNumber !== undefined && { certificateNumber }),
      ...(result && { result }),
      ...(notes !== undefined && { notes }),
      documentUrl: finalDocUrl,
      updatedBy: req.user?.id || null,
    })

    const updatedCalibration = await AssetCalibration.findByPk(id, {
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

    return res.status(200).json(successResponse('Calibration record updated successfully', updatedCalibration))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error updating calibration:', error)
    return res.status(500).json(errorResponse('Failed to update calibration record'))
  }
}

export const deleteCalibration = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string

    const calibration = await AssetCalibration.findByPk(id)
    if (!calibration) {
      throw new AppError('Calibration record not found', 404)
    }

    await calibration.destroy()

    return res.status(200).json(successResponse('Calibration record deleted successfully', null))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error deleting calibration:', error)
    return res.status(500).json(errorResponse('Failed to delete calibration record'))
  }
}

export const getUpcomingMaintenance = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const days = Number(req.query.days || 30)
    const locationId = req.params.locationId as string | undefined

    const today = new Date()
    const targetDate = new Date()
    targetDate.setDate(today.getDate() + days)

    const assetInclude: IncludeOptions = {
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

    const upcomingServices = await AssetServiceLog.findAll({
      where: {
        completionStatus: 'pending',
        nextServiceDate: {
          [Op.between]: [today, targetDate],
        },
      },
      include: [assetInclude],
      order: [['nextServiceDate', 'ASC']],
    })

    const upcomingCalibrations = await AssetCalibration.findAll({
      where: {
        nextCalibrationDate: {
          [Op.between]: [today, targetDate],
        },
      },
      include: [assetInclude],
      order: [['nextCalibrationDate', 'ASC']],
    })

    return res.status(200).json(
      successResponse('Upcoming maintenance retrieved successfully', {
        services: upcomingServices,
        calibrations: upcomingCalibrations,
      }),
    )
  } catch (error) {
    console.error('Error retrieving upcoming maintenance:', error)
    return res.status(500).json(errorResponse('Failed to retrieve upcoming maintenance'))
  }
}
