import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { Op, QueryTypes, Sequelize } from 'sequelize'
import sequelize from '../../../config/db/index.js'
import { AssetCategory, AssetCategoryLocation, AssetItem, AssetVendor } from '../../../models/index.js'
import { AppError } from '../../../utils/appError.js'
import { errorResponse, successResponse } from '../../../utils/response/index.js'

export const createCategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, description } = req.body
    const locationId = req.params.locationId as string | undefined

    const category = await AssetCategory.create({
      name,
      description,
      createdBy: req.user?.id || null,
    })

    if (locationId) {
      await AssetCategoryLocation.create({
        categoryId: category.id,
        locationId,
        createdBy: req.user?.id || null,
      })
    }

    return res.status(201).json(successResponse('Category created successfully', category))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error creating category:', error)
    return res.status(500).json(errorResponse('Failed to create category'))
  }
}

export const getCategories = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query
    const locationId = req.params.locationId as string | undefined

    const offset = (Number(page) - 1) * Number(limit)
    const whereClause: Record<string, unknown> = {}

    const searchStr = typeof search === 'string' ? search.trim() : String(search || '').trim()
    const searchCondition =
      searchStr.length > 0
        ? Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('AssetCategory.name')), {
            [Op.like]: `%${searchStr.toLowerCase()}%`,
          })
        : null

    let categoryIdFilter: string[] | null = null
    if (locationId && locationId !== 'all') {
      const rows = (await sequelize.query('SELECT categoryId FROM asset_category_locations WHERE locationId = ?', {
        replacements: [locationId],
        type: QueryTypes.SELECT,
      })) as { categoryId: string }[]
      categoryIdFilter = rows.map((r) => r.categoryId)

      if (categoryIdFilter.length === 0) {
        return res.status(200).json(
          successResponse('Categories retrieved successfully', {
            categories: [],
            pagination: {
              total: 0,
              page: Number(page),
              limit: Number(limit),
              pages: 0,
            },
          }),
        )
      }
      whereClause.id = { [Op.in]: categoryIdFilter }
    }

    if (searchCondition) {
      const andKey = Op.and as unknown as string
      const currentAnd = (whereClause[andKey] as unknown[]) || []
      whereClause[andKey] = [...currentAnd, searchCondition]
    }

    const { rows: categories, count } = await AssetCategory.findAndCountAll({
      where: whereClause,
      limit: Number(limit),
      offset,
      order: [['name', 'ASC']],
    })

    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const vendorCount = await AssetVendor.count({
          where: { categoryId: category.id },
        })

        const itemCount = await AssetItem.count({
          where: { categoryId: category.id },
        })

        return {
          ...category.toJSON(),
          vendorCount,
          itemCount,
        }
      }),
    )

    return res.status(200).json(
      successResponse('Categories retrieved successfully', {
        categories: categoriesWithCounts,
        pagination: {
          total: count,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(count / Number(limit)),
        },
      }),
    )
  } catch (error) {
    console.error('Error retrieving categories:', error)
    return res.status(500).json(errorResponse('Failed to retrieve categories'))
  }
}

export const getCategoryById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string

    const category = await AssetCategory.findOne({
      where: { id },
    })

    if (!category) {
      throw new AppError('Category not found', 404)
    }

    const vendorCount = await AssetVendor.count({
      where: { categoryId: id },
    })

    const itemCount = await AssetItem.count({
      where: { categoryId: id },
    })

    const categoryWithCounts = {
      ...category.toJSON(),
      vendorCount,
      itemCount,
    }

    return res.status(200).json(successResponse('Category retrieved successfully', categoryWithCounts))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error retrieving category:', error)
    return res.status(500).json(errorResponse('Failed to retrieve category'))
  }
}

export const updateCategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const { name, description } = req.body

    const category = await AssetCategory.findOne({
      where: { id },
    })

    if (!category) {
      throw new AppError('Category not found', 404)
    }

    await category.update({
      ...(name && { name }),
      ...(description !== undefined && { description }),
      updatedBy: req.user?.id || null,
    })

    return res.status(200).json(successResponse('Category updated successfully', category))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error updating category:', error)
    return res.status(500).json(errorResponse('Failed to update category'))
  }
}

export const deleteCategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string

    const category = await AssetCategory.findOne({
      where: { id },
    })

    if (!category) {
      throw new AppError('Category not found', 404)
    }

    const vendorCount = await AssetVendor.count({
      where: { categoryId: id },
    })

    if (vendorCount > 0) {
      throw new AppError(
        `Cannot delete category with ${vendorCount} vendor(s). Please reassign or delete vendors first.`,
        400,
      )
    }

    const itemCount = await AssetItem.count({
      where: { categoryId: id },
    })

    if (itemCount > 0) {
      throw new AppError(
        `Cannot delete category with ${itemCount} item(s). Please reassign or delete items first.`,
        400,
      )
    }

    await category.destroy()

    return res.status(200).json(successResponse('Category deleted successfully', null))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error deleting category:', error)
    return res.status(500).json(errorResponse('Failed to delete category'))
  }
}
