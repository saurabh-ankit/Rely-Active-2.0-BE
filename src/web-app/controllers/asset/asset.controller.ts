import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { Op, Sequelize } from 'sequelize'
import { Asset, AssetCategory, AssetItem, AssetVendor, AssetWarranty, Property } from '../../../models/index.js'
import { AppError } from '../../../utils/appError.js'
import { errorResponse, successResponse } from '../../../utils/response/index.js'

export const createAsset = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      itemId,
      locationId,
      vendorId,
      serialNumber,
      assetTag,
      qrCode,
      purchaseDate,
      purchasePrice,
      currentValue,
      warrantyEndDate,
      condition,
      status,
      notes,
    } = req.body

    const item = await AssetItem.findByPk(itemId)
    if (!item) {
      throw new AppError('Item not found', 404)
    }

    const location = await Property.findByPk(locationId)
    if (!location) {
      throw new AppError('Location not found', 404)
    }

    if (vendorId) {
      const vendor = await AssetVendor.findByPk(vendorId)
      if (!vendor) {
        throw new AppError('Vendor not found', 404)
      }
    }

    const asset = await Asset.create({
      itemId,
      locationId,
      vendorId: vendorId || null,
      serialNumber,
      assetTag,
      qrCode,
      purchaseDate,
      purchasePrice,
      currentValue: currentValue || purchasePrice,
      warrantyEndDate: warrantyEndDate || null,
      condition,
      status,
      notes,
      createdBy: req.user?.id || null,
    })

    const createdAsset = await Asset.findByPk(asset.id, {
      include: [
        {
          model: AssetItem,
          as: 'item',
          attributes: ['id', 'name', 'model', 'manufacturer'],
          include: [
            {
              model: AssetCategory,
              as: 'category',
              attributes: ['id', 'name'],
            },
          ],
        },
        {
          model: Property,
          as: 'location',
          attributes: ['id', 'property_name'],
        },
        {
          model: AssetVendor,
          as: 'vendor',
          attributes: ['id', 'name', 'contactPerson', 'email', 'phone'],
        },
      ],
    })

    return res.status(201).json(successResponse('Asset created successfully', createdAsset))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error creating asset:', error)
    return res.status(500).json(errorResponse('Failed to create asset'))
  }
}

export const getAssets = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, search = '', itemId, categoryId, status, condition } = req.query
    const locationId = req.params.locationId as string | undefined

    const offset = (Number(page) - 1) * Number(limit)
    const whereClause: Record<string, unknown> = {}

    if (search) {
      const searchStr = typeof search === 'string' ? search.trim() : String(search || '').trim()
      if (searchStr.length > 0) {
        whereClause[Op.or as unknown as string] = [
          Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('Asset.serialNumber')), {
            [Op.like]: `%${searchStr.toLowerCase()}%`,
          }),
          Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('Asset.assetTag')), {
            [Op.like]: `%${searchStr.toLowerCase()}%`,
          }),
          Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('item.name')), {
            [Op.like]: `%${searchStr.toLowerCase()}%`,
          }),
        ]
      }
    }

    if (itemId) {
      whereClause.itemId = itemId
    }

    if (status) {
      whereClause.status = status
    }

    if (condition) {
      whereClause.condition = condition
    }

    if (categoryId) {
      const itemsInCategory = await AssetItem.findAll({
        where: { categoryId: categoryId as string },
        attributes: ['id'],
        raw: true,
      })
      const itemIds = itemsInCategory.map((item) => item.id)

      if (itemIds.length === 0) {
        return res.status(200).json(
          successResponse('Assets retrieved successfully', {
            assets: [],
            pagination: {
              total: 0,
              page: Number(page),
              limit: Number(limit),
              pages: 0,
            },
          }),
        )
      }

      whereClause.itemId = { [Op.in]: itemIds }
    }

    if (locationId && locationId !== 'all') {
      whereClause.locationId = locationId
    }

    const itemInclude: unknown = {
      model: AssetItem,
      as: 'item',
      attributes: ['id', 'name', 'model', 'manufacturer', 'categoryId'],
      include: [
        {
          model: AssetCategory,
          as: 'category',
          attributes: ['id', 'name'],
        },
      ],
    }

    const { rows: assets, count } = await Asset.findAndCountAll({
      where: whereClause,
      include: [
        itemInclude as never,
        {
          model: Property,
          as: 'location',
          attributes: ['id', 'property_name'],
        },
        {
          model: AssetVendor,
          as: 'vendor',
          attributes: ['id', 'name', 'contactPerson', 'email', 'phone'],
        },
        {
          model: AssetWarranty,
          as: 'warranties',
          attributes: ['warrantyEndDate'],
          required: false,
        },
      ],
      limit: Number(limit),
      offset,
      order: [['createdAt', 'DESC']],
      distinct: true,
    })

    const assetsWithWarranty = assets.map((asset) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const plain = (asset as any).get({ plain: true }) as Record<string, unknown> & {
        warranties?: Array<{ warrantyEndDate?: string }>
        warrantyEndDate?: string
      }
      const warranties = plain.warranties || []
      const latestWarrantyEndDate = warranties.length
        ? warranties.reduce<string | null>(
            (latest, w) =>
              !latest || new Date(w.warrantyEndDate || 0) > new Date(latest) ? w.warrantyEndDate || null : latest,
            null,
          )
        : plain.warrantyEndDate
      delete plain.warranties
      return { ...plain, warrantyEndDate: latestWarrantyEndDate }
    })

    return res.status(200).json(
      successResponse('Assets retrieved successfully', {
        assets: assetsWithWarranty,
        pagination: {
          total: count,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(count / Number(limit)),
        },
      }),
    )
  } catch (error) {
    console.error('Error retrieving assets:', error)
    return res.status(500).json(errorResponse('Failed to retrieve assets'))
  }
}

export const getAssetById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string

    const asset = await Asset.findOne({
      where: { id },
      include: [
        {
          model: AssetItem,
          as: 'item',
          attributes: ['id', 'name', 'model', 'manufacturer', 'specifications'],
          include: [
            {
              model: AssetCategory,
              as: 'category',
              attributes: ['id', 'name'],
            },
          ],
        },
        {
          model: Property,
          as: 'location',
          attributes: ['id', 'property_name'],
        },
        {
          model: AssetVendor,
          as: 'vendor',
          attributes: ['id', 'name', 'contactPerson', 'email', 'phone'],
        },
      ],
    })

    if (!asset) {
      throw new AppError('Asset not found', 404)
    }

    return res.status(200).json(successResponse('Asset retrieved successfully', asset))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error retrieving asset:', error)
    return res.status(500).json(errorResponse('Failed to retrieve asset'))
  }
}

export const updateAsset = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const {
      itemId,
      locationId,
      vendorId,
      serialNumber,
      assetTag,
      qrCode,
      purchaseDate,
      purchasePrice,
      currentValue,
      warrantyEndDate,
      condition,
      status,
      notes,
    } = req.body

    const asset = await Asset.findOne({
      where: { id },
    })

    if (!asset) {
      throw new AppError('Asset not found', 404)
    }

    if (itemId) {
      const item = await AssetItem.findByPk(itemId)
      if (!item) {
        throw new AppError('Item not found', 404)
      }
    }

    if (locationId) {
      const location = await Property.findByPk(locationId)
      if (!location) {
        throw new AppError('Location not found', 404)
      }
    }

    if (vendorId) {
      const vendor = await AssetVendor.findByPk(vendorId)
      if (!vendor) {
        throw new AppError('Vendor not found', 404)
      }
    }

    await asset.update({
      ...(itemId && { itemId }),
      ...(locationId && { locationId }),
      ...(vendorId !== undefined && { vendorId: vendorId || null }),
      ...(serialNumber !== undefined && { serialNumber }),
      ...(assetTag !== undefined && { assetTag }),
      ...(qrCode !== undefined && { qrCode }),
      ...(purchaseDate !== undefined && { purchaseDate }),
      ...(purchasePrice !== undefined && { purchasePrice }),
      ...(currentValue !== undefined && { currentValue }),
      ...(warrantyEndDate !== undefined && { warrantyEndDate: warrantyEndDate || null }),
      ...(condition && { condition }),
      ...(status && { status }),
      ...(notes !== undefined && { notes }),
      updatedBy: req.user?.id || null,
    })

    const updatedAsset = await Asset.findByPk(id, {
      include: [
        {
          model: AssetItem,
          as: 'item',
          attributes: ['id', 'name', 'model', 'manufacturer'],
          include: [
            {
              model: AssetCategory,
              as: 'category',
              attributes: ['id', 'name'],
            },
          ],
        },
        {
          model: Property,
          as: 'location',
          attributes: ['id', 'property_name'],
        },
        {
          model: AssetVendor,
          as: 'vendor',
          attributes: ['id', 'name', 'contactPerson', 'email', 'phone'],
        },
      ],
    })

    return res.status(200).json(successResponse('Asset updated successfully', updatedAsset))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error updating asset:', error)
    return res.status(500).json(errorResponse('Failed to update asset'))
  }
}

export const deleteAsset = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string

    const asset = await Asset.findOne({
      where: { id },
    })

    if (!asset) {
      throw new AppError('Asset not found', 404)
    }

    if (asset.status === 'assigned') {
      throw new AppError('Cannot delete an assigned asset', 400)
    }

    await asset.destroy()

    return res.status(200).json(successResponse('Asset deleted successfully', null))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error deleting asset:', error)
    return res.status(500).json(errorResponse('Failed to delete asset'))
  }
}

export const getAssetStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = req.params.locationId as string | undefined
    const whereClause: Record<string, unknown> = {}

    if (locationId && locationId !== 'all') {
      whereClause.locationId = locationId
    }

    const totalAssets = await Asset.count({ where: whereClause })

    const availableAssets = await Asset.count({
      where: { ...whereClause, status: 'available' },
    })

    const assignedAssets = await Asset.count({
      where: { ...whereClause, status: 'assigned' },
    })

    const maintenanceAssets = await Asset.count({
      where: { ...whereClause, status: 'maintenance' },
    })

    const retiredAssets = await Asset.count({
      where: { ...whereClause, status: 'retired' },
    })

    const disposedAssets = await Asset.count({
      where: { ...whereClause, status: 'disposed' },
    })

    const assets = await Asset.findAll({
      where: whereClause,
      attributes: ['currentValue', 'createdAt'],
    })

    const totalValue = assets.reduce((sum, asset) => {
      return sum + (Number(asset.currentValue) || 0)
    }, 0)

    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())

    const assetsForWarrantyCount = await Asset.findAll({
      where: whereClause,
      attributes: ['id', 'warrantyEndDate'],
      include: [
        {
          model: AssetWarranty,
          as: 'warranties',
          attributes: ['warrantyEndDate'],
          required: false,
        },
      ],
    })

    const underWarranty = assetsForWarrantyCount.filter((asset) => {
      const plain = asset.get({ plain: true }) as {
        warrantyEndDate?: string | Date | null
        warranties?: { warrantyEndDate: string | Date }[]
      }
      const warranties = plain.warranties || []
      const effectiveWarrantyEndDate = warranties.length
        ? warranties.reduce<string | Date | null>(
            (latest, w) => (!latest || new Date(w.warrantyEndDate) > new Date(latest) ? w.warrantyEndDate : latest),
            null,
          )
        : (plain.warrantyEndDate ?? null)

      if (!effectiveWarrantyEndDate) {
        return false
      }

      return new Date(effectiveWarrantyEndDate) >= startOfToday
    }).length

    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    const recentAdditions = assets.filter((asset) => new Date(asset.createdAt) >= firstDayOfMonth).length

    return res.status(200).json(
      successResponse('Asset stats retrieved successfully', {
        totalAssets,
        availableAssets,
        assignedAssets,
        maintenanceAssets,
        retiredAssets,
        disposedAssets,
        totalValue,
        underWarranty,
        recentAdditions,
      }),
    )
  } catch (error) {
    console.error('Error retrieving asset stats:', error)
    return res.status(500).json(errorResponse('Failed to retrieve asset stats'))
  }
}
