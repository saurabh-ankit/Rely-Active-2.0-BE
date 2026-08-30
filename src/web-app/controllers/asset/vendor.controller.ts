import type { NextFunction, Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { Op, Sequelize, type Includeable } from 'sequelize'
import {
  AssetCategory,
  AssetVendor,
  AssetVendorCustomField,
  AssetVendorLocation,
  Property,
} from '../../../models/index.js'
import { AppError } from '../../../utils/appError.js'
import { errorResponse, successResponse } from '../../../utils/response/index.js'

export const createVendor = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { name, categoryId, contactPerson, email, phone, address, website, taxId, locationIds } = req.body
    const currentLocationId = req.params.locationId as string | undefined

    if (!name || !categoryId) {
      return res.status(400).json(errorResponse('name and categoryId are required'))
    }

    let parsedLocationIds: string[] = []
    if (locationIds) {
      try {
        parsedLocationIds = typeof locationIds === 'string' ? JSON.parse(locationIds) : locationIds
        if (!Array.isArray(parsedLocationIds)) {
          return res.status(400).json(errorResponse('Invalid locationIds format. Must be an array or JSON string.'))
        }
      } catch (parseError: unknown) {
        const err = parseError as Error
        return res.status(400).json(errorResponse(`Invalid locationIds JSON format: ${err.message}`))
      }
    }

    const category = await AssetCategory.findByPk(categoryId)
    if (!category) {
      throw new AppError('Category not found', 404)
    }

    const createdBy = req.user?.id || null

    const vendor = await AssetVendor.create({
      name,
      categoryId,
      contactPerson,
      email,
      phone,
      address,
      website,
      taxId,
      createdBy,
    })

    let locationsToAssociate = parsedLocationIds
    if (locationsToAssociate.length === 0 && currentLocationId && currentLocationId !== 'all') {
      locationsToAssociate = [currentLocationId]
    }

    if (locationsToAssociate.length > 0) {
      const vendorLocations = locationsToAssociate.map((locationId: string) => ({
        vendorId: vendor.id,
        locationId,
        createdBy,
      }))
      await AssetVendorLocation.bulkCreate(vendorLocations)
    }

    const { customFields } = req.body
    if (customFields) {
      let parsedCustomFields: Record<string, unknown>[] = []
      if (typeof customFields === 'string' && customFields.trim() !== '') {
        try {
          parsedCustomFields = JSON.parse(customFields)
          if (!Array.isArray(parsedCustomFields)) {
            return res.status(400).json(errorResponse('customFields must be a JSON array'))
          }
        } catch (parseError: unknown) {
          const err = parseError as Error
          return res.status(400).json(errorResponse(`Invalid customFields JSON format: ${err.message}`))
        }
      } else if (Array.isArray(customFields)) {
        parsedCustomFields = customFields
      }

      for (const field of parsedCustomFields) {
        const fieldName = String(field.fieldName || '').trim()
        if (!fieldName) {
          continue
        }

        if (!field.fieldLabel || !field.fieldType) {
          return res
            .status(400)
            .json(
              errorResponse(
                `Custom field '${fieldName}' is missing required fields: fieldLabel and fieldType are required`,
              ),
            )
        }

        const validFieldTypes = ['text', 'number', 'date', 'select', 'bool', 'document']
        const fieldType = String(field.fieldType || '')
        if (!validFieldTypes.includes(fieldType)) {
          return res
            .status(400)
            .json(
              errorResponse(
                `Invalid fieldType '${fieldType}' for field '${fieldName}'. Allowed types: ${validFieldTypes.join(', ')}`,
              ),
            )
        }

        const fieldValue = field.fieldValue !== undefined && field.fieldValue !== null ? String(field.fieldValue) : null

        await AssetVendorCustomField.create({
          vendorId: vendor.id,
          fieldName,
          fieldLabel: String(field.fieldLabel).trim(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          fieldType: fieldType as any,
          fieldValue,
          enumValues: field.enumValues && Array.isArray(field.enumValues) ? field.enumValues : null,
          displayOrder: field.displayOrder !== undefined ? Number(field.displayOrder) : 0,
          defaultValue:
            field.defaultValue !== undefined && field.defaultValue !== null ? String(field.defaultValue) : null,
          createdBy,
          updatedBy: createdBy,
        })
      }
    }

    const createdVendor = await AssetVendor.findByPk(vendor.id, {
      include: [
        {
          model: Property,
          as: 'locations',
          attributes: ['id', 'property_name'],
        },
        {
          model: AssetCategory,
          as: 'category',
          attributes: ['id', 'name'],
        },
        {
          model: AssetVendorCustomField,
          as: 'customFields',
          required: false,
        },
      ],
    })

    return res.status(201).json(successResponse('Vendor created successfully', createdVendor))
  } catch (error) {
    next(error)
  }
}

export const getVendors = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, search = '', categoryId } = req.query
    const locationId = req.params.locationId as string | undefined

    const offset = (Number(page) - 1) * Number(limit)
    const whereClause: Record<string, unknown> = {}

    if (search) {
      const searchStr = typeof search === 'string' ? search.trim() : String(search || '').trim()
      if (searchStr.length > 0) {
        whereClause[Op.or as unknown as string] = [
          Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('AssetVendor.name')), {
            [Op.like]: `%${searchStr.toLowerCase()}%`,
          }),
          Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('AssetVendor.email')), {
            [Op.like]: `%${searchStr.toLowerCase()}%`,
          }),
          Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('AssetVendor.phone')), {
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
        model: Property,
        as: 'locations',
        attributes: ['id', 'property_name'],
        through: { attributes: [] },
      },
      {
        model: AssetCategory,
        as: 'category',
        attributes: ['id', 'name'],
      },
    ]

    if (locationId && locationId !== 'all') {
      includeClause = [
        {
          model: Property,
          as: 'locations',
          attributes: ['id', 'property_name'],
          through: { attributes: [] },
          where: { id: locationId },
          required: true,
        },
        {
          model: AssetCategory,
          as: 'category',
          attributes: ['id', 'name'],
        },
      ]
    }

    const { rows: vendors, count } = await AssetVendor.findAndCountAll({
      where: whereClause,
      include: [
        ...includeClause,
        {
          model: AssetVendorCustomField,
          as: 'customFields',
          required: false,
        },
      ],
      limit: Number(limit),
      offset,
      order: [['name', 'ASC']],
      distinct: true,
    })

    return res.status(200).json(
      successResponse('Vendors retrieved successfully', {
        vendors,
        pagination: {
          total: count,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(count / Number(limit)),
        },
      }),
    )
  } catch (error) {
    console.error('Error retrieving vendors:', error)
    return res.status(500).json(errorResponse('Failed to retrieve vendors'))
  }
}

export const getVendorById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string

    const vendor = await AssetVendor.findOne({
      where: { id },
      include: [
        {
          model: Property,
          as: 'locations',
          attributes: ['id', 'property_name'],
        },
        {
          model: AssetCategory,
          as: 'category',
          attributes: ['id', 'name'],
        },
        {
          model: AssetVendorCustomField,
          as: 'customFields',
          required: false,
        },
      ],
    })

    if (!vendor) {
      throw new AppError('Vendor not found', 404)
    }

    return res.status(200).json(successResponse('Vendor retrieved successfully', vendor))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error retrieving vendor:', error)
    return res.status(500).json(errorResponse('Failed to retrieve vendor'))
  }
}

export const updateVendor = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string
    const { name, categoryId, contactPerson, email, phone, address, website, taxId, customFields, locationIds } =
      req.body

    const vendor = await AssetVendor.findOne({
      where: { id },
    })

    if (!vendor) {
      throw new AppError('Vendor not found', 404)
    }

    if (categoryId) {
      const category = await AssetCategory.findByPk(categoryId)
      if (!category) {
        throw new AppError('Category not found', 404)
      }
    }

    await vendor.update({
      ...(name && { name }),
      ...(categoryId !== undefined && { categoryId }),
      ...(contactPerson !== undefined && { contactPerson }),
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone }),
      ...(address !== undefined && { address }),
      ...(website !== undefined && { website }),
      ...(taxId !== undefined && { taxId }),
      updatedBy: req.user?.id,
    })

    if (locationIds !== undefined) {
      let parsedLocationIds: string[] = []
      try {
        parsedLocationIds = typeof locationIds === 'string' ? JSON.parse(locationIds) : locationIds
        if (!Array.isArray(parsedLocationIds)) {
          return res.status(400).json(errorResponse('Invalid locationIds format. Must be an array or JSON string.'))
        }
      } catch (parseError: unknown) {
        const err = parseError as Error
        return res.status(400).json(errorResponse(`Invalid locationIds JSON format: ${err.message}`))
      }

      await AssetVendorLocation.destroy({
        where: { vendorId: id },
      })

      if (parsedLocationIds.length > 0) {
        const vendorLocations = parsedLocationIds.map((locationId: string) => ({
          vendorId: id,
          locationId,
          createdBy: req.user?.id || '',
        }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await AssetVendorLocation.bulkCreate(vendorLocations as any)
      }
    }

    if (customFields !== undefined) {
      let parsedCustomFields: Record<string, unknown>[] = []
      if (typeof customFields === 'string' && customFields.trim() !== '') {
        try {
          parsedCustomFields = JSON.parse(customFields)
          if (!Array.isArray(parsedCustomFields)) {
            return res.status(400).json(errorResponse('customFields must be a JSON array'))
          }
        } catch (parseError: unknown) {
          const err = parseError as Error
          return res.status(400).json(errorResponse(`Invalid customFields JSON format: ${err.message}`))
        }
      } else if (Array.isArray(customFields)) {
        parsedCustomFields = customFields
      }

      await AssetVendorCustomField.destroy({
        where: { vendorId: id },
      })

      for (const field of parsedCustomFields) {
        const fieldName = String(field.fieldName || '').trim()
        if (!fieldName) {
          continue
        }

        if (!field.fieldLabel || !field.fieldType) {
          return res
            .status(400)
            .json(
              errorResponse(
                `Custom field '${fieldName}' is missing required fields: fieldLabel and fieldType are required`,
              ),
            )
        }

        const validFieldTypes = ['text', 'number', 'date', 'select', 'bool', 'document']
        const fieldType = String(field.fieldType || '')
        if (!validFieldTypes.includes(fieldType)) {
          return res
            .status(400)
            .json(
              errorResponse(
                `Invalid fieldType '${fieldType}' for field '${fieldName}'. Allowed types: ${validFieldTypes.join(', ')}`,
              ),
            )
        }

        const fieldValue = field.fieldValue !== undefined && field.fieldValue !== null ? String(field.fieldValue) : null

        await AssetVendorCustomField.create({
          vendorId: id,
          fieldName,
          fieldLabel: String(field.fieldLabel).trim(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          fieldType: fieldType as any,
          fieldValue,
          enumValues: field.enumValues && Array.isArray(field.enumValues) ? field.enumValues : null,
          displayOrder: field.displayOrder !== undefined ? Number(field.displayOrder) : 0,
          defaultValue:
            field.defaultValue !== undefined && field.defaultValue !== null ? String(field.defaultValue) : null,
          createdBy: req.user?.id || null,
          updatedBy: req.user?.id || null,
        })
      }
    }

    const updatedVendor = await AssetVendor.findByPk(id, {
      include: [
        {
          model: Property,
          as: 'locations',
          attributes: ['id', 'property_name'],
        },
        {
          model: AssetCategory,
          as: 'category',
          attributes: ['id', 'name'],
        },
        {
          model: AssetVendorCustomField,
          as: 'customFields',
          required: false,
        },
      ],
    })

    return res.status(200).json(successResponse('Vendor updated successfully', updatedVendor))
  } catch (error) {
    next(error)
  }
}

export const deleteVendor = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string

    const vendor = await AssetVendor.findOne({
      where: { id },
    })

    if (!vendor) {
      throw new AppError('Vendor not found', 404)
    }

    await vendor.destroy()

    return res.status(200).json(successResponse('Vendor deleted successfully', null))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error deleting vendor:', error)
    return res.status(500).json(errorResponse('Failed to delete vendor'))
  }
}

export const getVendorsDropdown = async (req: AuthenticatedRequest, res: Response) => {
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

    const vendors = await AssetVendor.findAll({
      where: whereClause,
      include: includeClause,
      attributes: ['id', 'name'],
      order: [['name', 'ASC']],
    })

    return res.status(200).json(successResponse('Vendors retrieved successfully', vendors))
  } catch (error) {
    console.error('Error retrieving vendors dropdown:', error)
    return res.status(500).json(errorResponse('Failed to retrieve vendors'))
  }
}
