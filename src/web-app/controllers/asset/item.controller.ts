import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { Op, Sequelize, type Includeable } from 'sequelize'
import { AssetCategory, AssetItem, AssetItemLocation, AssetVendor, Property } from '../../../models/index.js'
import { AppError } from '../../../utils/appError.js'
import { errorResponse, successResponse } from '../../../utils/response/index.js'

export const createItem = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, description, categoryId, vendorId, model, manufacturer, specifications, locationIds = [] } = req.body
    const currentLocationId = req.params.locationId as string | undefined

    const category = await AssetCategory.findByPk(categoryId)
    if (!category) {
      throw new AppError('Category not found', 404)
    }

    if (vendorId) {
      const vendor = await AssetVendor.findByPk(vendorId)
      if (!vendor) {
        throw new AppError('Vendor not found', 404)
      }
    }

    const item = await AssetItem.create({
      name,
      description,
      categoryId,
      vendorId: vendorId || null,
      model,
      manufacturer,
      specifications,
      createdBy: req.user?.id || null,
    })

    let locationsToAssociate = locationIds
    if (locationsToAssociate.length === 0 && currentLocationId && currentLocationId !== 'all') {
      locationsToAssociate = [currentLocationId]
    }

    if (locationsToAssociate.length > 0) {
      const itemLocations = locationsToAssociate.map((locationId: string) => ({
        itemId: item.id,
        locationId,
        createdBy: req.user?.id || null,
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await AssetItemLocation.bulkCreate(itemLocations as any)
    }

    const createdItem = await AssetItem.findByPk(item.id, {
      include: [
        {
          model: AssetCategory,
          as: 'category',
          attributes: ['id', 'name'],
        },
        {
          model: AssetVendor,
          as: 'vendor',
          attributes: ['id', 'name'],
        },
        {
          model: Property,
          as: 'locations',
          attributes: ['id', 'property_name'],
          through: { attributes: [] },
        },
      ],
    })

    return res.status(201).json(successResponse('Item created successfully', createdItem))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error creating item:', error)
    return res.status(500).json(errorResponse('Failed to create item'))
  }
}

export const getItems = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, search = '', categoryId } = req.query
    const locationId = req.params.locationId as string | undefined

    const offset = (Number(page) - 1) * Number(limit)
    const whereClause: Record<string, unknown> = {}

    if (search) {
      const searchStr = typeof search === 'string' ? search.trim() : String(search || '').trim()
      if (searchStr.length > 0) {
        whereClause[Op.or as unknown as string] = [
          Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('AssetItem.name')), {
            [Op.like]: `%${searchStr.toLowerCase()}%`,
          }),
          Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('AssetItem.model')), {
            [Op.like]: `%${searchStr.toLowerCase()}%`,
          }),
          Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('AssetItem.manufacturer')), {
            [Op.like]: `%${searchStr.toLowerCase()}%`,
          }),
        ]
      }
    }

    if (categoryId) {
      whereClause.categoryId = categoryId
    }

    let includeClause: Includeable[] = [
      {
        model: AssetCategory,
        as: 'category',
        attributes: ['id', 'name'],
      },
      {
        model: AssetVendor,
        as: 'vendor',
        attributes: ['id', 'name'],
      },
      {
        model: Property,
        as: 'locations',
        attributes: ['id', 'property_name'],
        through: { attributes: [] },
      },
    ]

    if (locationId && locationId !== 'all') {
      includeClause = [
        {
          model: AssetCategory,
          as: 'category',
          attributes: ['id', 'name'],
        },
        {
          model: AssetVendor,
          as: 'vendor',
          attributes: ['id', 'name'],
        },
        {
          model: Property,
          as: 'locations',
          attributes: ['id', 'property_name'],
          through: { attributes: [] },
          where: { id: locationId },
          required: true,
        },
      ]
    }

    const { rows: items, count } = await AssetItem.findAndCountAll({
      where: whereClause,
      include: includeClause,
      limit: Number(limit),
      offset,
      order: [['name', 'ASC']],
      distinct: true,
    })

    return res.status(200).json(
      successResponse('Items retrieved successfully', {
        items,
        pagination: {
          total: count,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(count / Number(limit)),
        },
      }),
    )
  } catch (error) {
    console.error('Error retrieving items:', error)
    return res.status(500).json(errorResponse('Failed to retrieve items'))
  }
}

export const getItemById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string

    const item = await AssetItem.findOne({
      where: { id },
      include: [
        {
          model: AssetCategory,
          as: 'category',
          attributes: ['id', 'name'],
        },
        {
          model: AssetVendor,
          as: 'vendor',
          attributes: ['id', 'name'],
        },
        {
          model: Property,
          as: 'locations',
          attributes: ['id', 'property_name'],
          through: { attributes: [] },
        },
      ],
    })

    if (!item) {
      throw new AppError('Item not found', 404)
    }

    return res.status(200).json(successResponse('Item retrieved successfully', item))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error retrieving item:', error)
    return res.status(500).json(errorResponse('Failed to retrieve item'))
  }
}

export const updateItem = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const { name, description, categoryId, vendorId, model, manufacturer, specifications, locationIds } = req.body

    const item = await AssetItem.findOne({
      where: { id },
    })

    if (!item) {
      throw new AppError('Item not found', 404)
    }

    if (categoryId) {
      const category = await AssetCategory.findByPk(categoryId)
      if (!category) {
        throw new AppError('Category not found', 404)
      }
    }

    if (vendorId) {
      const vendor = await AssetVendor.findByPk(vendorId)
      if (!vendor) {
        throw new AppError('Vendor not found', 404)
      }
    }

    await item.update({
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(categoryId && { categoryId }),
      ...(vendorId !== undefined && { vendorId: vendorId || null }),
      ...(model !== undefined && { model }),
      ...(manufacturer !== undefined && { manufacturer }),
      ...(specifications !== undefined && { specifications }),
      updatedBy: req.user?.id || null,
    })

    if (locationIds !== undefined) {
      await AssetItemLocation.destroy({
        where: { itemId: id },
      })

      if (locationIds.length > 0) {
        const itemLocations = locationIds.map((locationId: string) => ({
          itemId: id,
          locationId,
          createdBy: req.user?.id || null,
        }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await AssetItemLocation.bulkCreate(itemLocations as any)
      }
    }

    const updatedItem = await AssetItem.findByPk(id, {
      include: [
        {
          model: AssetCategory,
          as: 'category',
          attributes: ['id', 'name'],
        },
        {
          model: AssetVendor,
          as: 'vendor',
          attributes: ['id', 'name'],
        },
        {
          model: Property,
          as: 'locations',
          attributes: ['id', 'property_name'],
          through: { attributes: [] },
        },
      ],
    })

    return res.status(200).json(successResponse('Item updated successfully', updatedItem))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error updating item:', error)
    return res.status(500).json(errorResponse('Failed to update item'))
  }
}

export const deleteItem = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string

    const item = await AssetItem.findOne({
      where: { id },
    })

    if (!item) {
      throw new AppError('Item not found', 404)
    }

    await item.destroy()

    return res.status(200).json(successResponse('Item deleted successfully', null))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error deleting item:', error)
    return res.status(500).json(errorResponse('Failed to delete item'))
  }
}

export const getItemsDropdown = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = req.params.locationId as string | undefined
    const { categoryId } = req.query

    const whereClause: Record<string, unknown> = {}

    if (categoryId) {
      whereClause.categoryId = categoryId
    }

    let includeClause: Includeable[] = []

    if (locationId && locationId !== 'all') {
      includeClause = [
        {
          model: Property,
          as: 'locations',
          attributes: [],
          through: { attributes: [] },
          where: { id: locationId },
          required: true,
        },
      ]
    }

    const items = await AssetItem.findAll({
      where: whereClause,
      include: includeClause,
      attributes: ['id', 'name', 'model', 'manufacturer'],
      order: [['name', 'ASC']],
    })

    return res.status(200).json(successResponse('Items retrieved successfully', items))
  } catch (error) {
    console.error('Error retrieving items dropdown:', error)
    return res.status(500).json(errorResponse('Failed to retrieve items'))
  }
}
