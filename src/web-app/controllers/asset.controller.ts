import { Response, NextFunction } from 'express'
import { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { Op, Sequelize, Includeable, QueryTypes, IncludeOptions } from 'sequelize'
import {
  Asset,
  AssetCategory,
  AssetItem,
  AssetVendor,
  AssetWarranty,
  Property,
  PropertyFloor,
  PropertyUnit,
  Resident,
  Role,
  User,
  UserLocation,
  AssetAssignment,
  PropertyBlock,
  AssetCategoryLocation,
  AssetComplianceCertification,
  AssetComplianceInspection,
  AssetComplianceTraining,
  AssetItemLocation,
  AssetCalibration,
  AssetServiceLog,
  AssetVendorCustomField,
  AssetVendorLocation,
} from '../../models/index.js'
import { AppError } from '../../utils/appError.js'
import { errorResponse, successResponse } from '../../utils/response/index.js'
import XLSX from 'xlsx'
import sequelize from '../../config/db/index.js'
import { uploadFileToS3, uploadBase64ToS3 } from '../../middlewares/s3/index.js'

// ─── From asset.controller.ts ───────────────────────────────────────────
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

// ─── From assignee.controller.ts ───────────────────────────────────────────
export const getEmployeesForAssignment = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = req.params.locationId as string | undefined

    const userLocWhere: Record<string, unknown> = {
      isActive: true,
    }
    if (locationId && locationId !== 'all') {
      userLocWhere.locId = locationId
    }

    const employees = await User.findAll({
      where: {
        isActive: true,
      },
      include: [
        {
          model: UserLocation,
          as: 'userLocations',
          required: true,
          where: userLocWhere,
          include: [
            {
              model: Role,
              as: 'role',
              required: true,
              where: {
                code: {
                  [Op.notIn]: ['SUPER_ADMIN', 'ADMIN', 'super_admin', 'admin'],
                },
              },
            },
          ],
        },
      ],
      attributes: ['id', 'username', 'email', 'phone'],
      order: [['username', 'ASC']],
      limit: 200,
    })

    const formattedEmployees = employees.map((emp) => {
      const empData = emp.toJSON() as unknown as Record<string, unknown>
      const uLocs = (empData.userLocations || []) as Array<Record<string, unknown>>
      const primaryRole = (uLocs[0]?.role as Record<string, unknown> | undefined)?.name || 'Employee'
      return {
        id: empData.id as string,
        name: (empData.username || empData.email || 'Unknown Employee') as string,
        email: empData.email,
        phone: empData.phone,
        role: primaryRole,
      }
    })

    return res.status(200).json(successResponse('Employees fetched successfully', formattedEmployees))
  } catch (error) {
    console.error('Error fetching employees:', error)
    return res.status(500).json(errorResponse('Failed to fetch employees'))
  }
}

export const getResidentsForAssignment = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = req.params.locationId as string | undefined

    const whereClause: Record<string, unknown> = {
      isResiding: true,
      isDeleted: false,
      status: { [Op.ne]: 'MOVED_OUT' },
    }

    if (locationId && locationId !== 'all') {
      whereClause.locId = locationId
    }

    const residents = await Resident.findAll({
      where: whereClause,
      include: [
        {
          model: PropertyUnit,
          as: 'unit',
          attributes: ['id', 'unit_number'],
          include: [
            {
              model: PropertyFloor,
              as: 'floor',
              attributes: ['id', 'floor_name', 'floor_number'],
            },
          ],
        },
        {
          model: Property,
          as: 'property',
          attributes: ['id', 'property_name'],
        },
      ],
      order: [['firstName', 'ASC']],
      limit: 200,
    })

    const formattedResidents = residents.map((r) => {
      const rData = r.toJSON() as unknown as Record<string, unknown>
      const firstName = String(rData.firstName || '')
      const lastName = String(rData.lastName || '')
      const fullName = `${firstName} ${lastName}`.trim()
      const type = String(rData.residentType || 'RESIDENT')
      const unit = rData.unit as Record<string, unknown> | undefined
      const floor = unit?.floor as Record<string, unknown> | undefined
      const unitNum = unit?.unit_number ? `Unit ${unit.unit_number}` : ''
      const floorLabel = (floor?.floor_name as string) || (floor?.floor_number ? `Floor ${floor.floor_number}` : '')
      const flatInfo = [floorLabel, unitNum].filter(Boolean).join(' — ')

      return {
        id: rData.id as string,
        name: fullName ? `${fullName} (${type}${flatInfo ? ` • ${flatInfo}` : ''})` : 'Unknown Resident',
        rawName: fullName,
        residentType: type,
        flatInfo,
        email: rData.email || undefined,
        phone: rData.phone || undefined,
      }
    })

    return res.status(200).json(successResponse('Residents fetched successfully', formattedResidents))
  } catch (error) {
    console.error('Error fetching residents for assignment:', error)
    return res.status(500).json(errorResponse('Failed to fetch residents'))
  }
}

// Backwards compatibility wrappers
export const getPatientsForAssignment = getResidentsForAssignment
export const getRoomsForAssignment = async (_req: AuthenticatedRequest, res: Response) => {
  return res.status(200).json(successResponse('Rooms fetched successfully', []))
}
export const getBedsForRoom = async (_req: AuthenticatedRequest, res: Response) => {
  return res.status(200).json(successResponse('Beds fetched successfully', []))
}

// ─── From assignment.controller.ts ───────────────────────────────────────────
const enrichAssignmentsWithAssigneeDetails = async (assignments: unknown[]) => {
  const enrichedAssignments = await Promise.all(
    assignments.map(async (assignment) => {
      const itemObj = assignment as Record<string, unknown>
      const assignmentData = (typeof itemObj?.toJSON === 'function' ? itemObj.toJSON() : itemObj) as Record<
        string,
        unknown
      >
      let assigneeDetails: Record<string, unknown> | null = null

      if (assignmentData.assigneeType === 'employee') {
        const user = await User.findOne({
          where: { id: assignmentData.assigneeId as string },
          attributes: ['id', 'username', 'email', 'phone'],
        })

        if (user) {
          assigneeDetails = {
            id: user.id,
            name: user.username || user.email || 'Unknown Employee',
            email: user.email || undefined,
            phone: user.phone || undefined,
          }
        }
      } else if (assignmentData.assigneeType === 'resident') {
        const resident = await Resident.findByPk(assignmentData.assigneeId as string, {
          include: [
            {
              model: PropertyUnit,
              as: 'unit',
              include: [{ model: PropertyFloor, as: 'floor' }],
            },
            { model: Property, as: 'property' },
          ],
        })

        if (resident) {
          const rData = resident.toJSON() as unknown as Record<string, unknown>
          const name = `${rData.firstName || ''} ${rData.lastName || ''}`.trim()
          const unit = rData.unit as Record<string, unknown> | undefined
          const floor = unit?.floor as Record<string, unknown> | undefined
          const unitNum = unit?.unit_number ? `Unit ${unit.unit_number}` : ''
          const floorLabel = (floor?.floor_name as string) || (floor?.floor_number ? `Floor ${floor.floor_number}` : '')
          const flatInfo = [floorLabel, unitNum].filter(Boolean).join(' — ')

          assigneeDetails = {
            id: resident.id,
            name: name || 'Unknown Resident',
            residentType: rData.residentType,
            flatInfo,
            email: rData.email || undefined,
            phone: rData.phone || undefined,
          }
        }
      } else if (assignmentData.assigneeType === 'flat') {
        const unit = await PropertyUnit.findByPk(assignmentData.assigneeId as string, {
          include: [
            {
              model: PropertyFloor,
              as: 'floor',
              include: [{ model: PropertyBlock, as: 'block' }],
            },
          ],
        })

        if (unit) {
          const uData = unit.toJSON() as unknown as Record<string, unknown>
          const floor = uData.floor as Record<string, unknown> | undefined
          const block = floor?.block as Record<string, unknown> | undefined
          const unitNum = uData.unit_number ? `Unit ${uData.unit_number}` : ''
          const floorLabel = (floor?.floor_name as string) || (floor?.floor_number ? `Floor ${floor.floor_number}` : '')
          const blockLabel = (block?.block_name as string) || ''
          const flatName = [blockLabel, floorLabel, unitNum].filter(Boolean).join(' • ')

          assigneeDetails = {
            id: unit.id,
            name: flatName || `Unit ${uData.unit_number}`,
            unitNumber: uData.unit_number,
            floorName: floorLabel,
            blockName: blockLabel,
          }
        }
      }

      return {
        ...assignmentData,
        assigneeDetails,
      }
    }),
  )

  return enrichedAssignments
}

export const createAssignment = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { assetId, assigneeType, assigneeId, bedId, assignedAt, expectedReturnDate, notes } = req.body
    const locationId = req.params.locationId as string | undefined

    const asset = await Asset.findByPk(assetId)
    if (!asset) {
      throw new AppError('Asset not found', 404)
    }

    if (asset.status !== 'available') {
      throw new AppError(`Asset is not available for assignment. Current status: ${asset.status}`, 400)
    }

    let roomId: string | undefined
    if (assigneeType === 'room') {
      roomId = assigneeId
    }

    const assignment = await AssetAssignment.create({
      assetId,
      assigneeType,
      assigneeId,
      bedId,
      roomId: roomId || null,
      locationId: locationId === 'all' || !locationId ? asset.locationId : locationId,
      assignedBy: req.user?.id || asset.locationId,
      assignedAt,
      expectedReturnDate,
      notes,
      createdBy: req.user?.id || null,
    })

    await asset.update({
      status: 'assigned' as never,
      updatedBy: req.user?.id || null,
    })

    const createdAssignment = await AssetAssignment.findByPk(assignment.id, {
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
          model: Property,
          as: 'location',
          attributes: ['id', 'property_name'],
        },
        {
          model: User,
          as: 'assigner',
          attributes: ['id', 'username', 'email'],
        },
      ],
    })

    const [enrichedAssignment] = await enrichAssignmentsWithAssigneeDetails([createdAssignment])

    return res.status(201).json(successResponse('Assignment created successfully', enrichedAssignment))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error creating assignment:', error)
    return res.status(500).json(errorResponse('Failed to create assignment'))
  }
}

export const getAssignments = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, assetId, assigneeType, assigneeId } = req.query
    const locationId = req.params.locationId as string | undefined

    const offset = (Number(page) - 1) * Number(limit)
    const whereClause: Record<string, unknown> = {}

    if (assetId) {
      whereClause.assetId = assetId
    }

    if (assigneeType) {
      whereClause.assigneeType = assigneeType
    }

    if (assigneeId) {
      whereClause.assigneeId = assigneeId
    }

    if (locationId && locationId !== 'all') {
      whereClause.locationId = locationId
    }

    const includes: Includeable[] = [
      {
        model: Asset,
        as: 'asset',
        required: false,
        include: [
          {
            model: AssetItem,
            as: 'item',
            required: false,
            attributes: ['id', 'name', 'model', 'categoryId'],
            include: [
              {
                model: AssetCategory,
                as: 'category',
                required: false,
                attributes: ['id', 'name'],
              },
            ],
          },
        ],
      },
      {
        model: Property,
        as: 'location',
        required: false,
        attributes: ['id', 'property_name'],
      },
      {
        model: User,
        as: 'assigner',
        required: false,
        attributes: ['id', 'username', 'email'],
      },
    ]

    const { rows: assignments, count } = await AssetAssignment.findAndCountAll({
      where: whereClause,
      include: includes,
      limit: Number(limit),
      offset,
      order: [['assignedAt', 'DESC']],
      distinct: true,
    })

    const enrichedAssignments = await enrichAssignmentsWithAssigneeDetails(assignments)

    return res.status(200).json(
      successResponse('Assignments retrieved successfully', {
        assignments: enrichedAssignments,
        pagination: {
          total: count,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(count / Number(limit)),
        },
      }),
    )
  } catch (error) {
    console.error('Error retrieving assignments:', error)
    return res.status(500).json(errorResponse('Failed to retrieve assignments'))
  }
}

export const getAssignmentById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string

    const assignment = await AssetAssignment.findOne({
      where: { id },
      include: [
        {
          model: Asset,
          as: 'asset',
          include: [
            {
              model: AssetItem,
              as: 'item',
              attributes: ['id', 'name', 'model', 'manufacturer'],
            },
          ],
        },
        {
          model: Property,
          as: 'location',
          attributes: ['id', 'property_name'],
        },
        {
          model: User,
          as: 'assigner',
          attributes: ['id', 'username', 'email'],
        },
      ],
    })

    if (!assignment) {
      throw new AppError('Assignment not found', 404)
    }

    const [enrichedAssignment] = await enrichAssignmentsWithAssigneeDetails([assignment])

    return res.status(200).json(successResponse('Assignment retrieved successfully', enrichedAssignment))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error retrieving assignment:', error)
    return res.status(500).json(errorResponse('Failed to retrieve assignment'))
  }
}

export const returnAsset = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const { returnedAt, returnCondition, notes } = req.body

    const assignment = await AssetAssignment.findOne({
      where: { id },
    })

    if (!assignment) {
      throw new AppError('Assignment not found', 404)
    }

    if (assignment.returnedAt) {
      throw new AppError('Asset has already been returned', 400)
    }

    const assetId = assignment.assetId

    await assignment.update({
      returnedAt: returnedAt || new Date(),
      returnCondition,
      notes: notes || assignment.notes,
      updatedBy: req.user?.id || null,
    })

    const asset = await Asset.findByPk(assetId)
    if (asset) {
      await asset.update({
        status: 'available' as never,
        updatedBy: req.user?.id || null,
      })
    }

    const updatedAssignment = await AssetAssignment.findByPk(id, {
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
          model: Property,
          as: 'location',
          attributes: ['id', 'property_name'],
        },
        {
          model: User,
          as: 'assigner',
          attributes: ['id', 'username', 'email'],
        },
      ],
    })

    return res.status(200).json(successResponse('Asset returned successfully', updatedAssignment))
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error returning asset:', error)
    return res.status(500).json(errorResponse('Failed to return asset'))
  }
}

export const getActiveAssignments = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = req.params.locationId as string | undefined

    const whereClause: Record<string, unknown> = {
      returnedAt: null,
    }

    if (locationId && locationId !== 'all') {
      whereClause.locationId = locationId
    }

    const assignments = await AssetAssignment.findAll({
      where: whereClause,
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
          model: Property,
          as: 'location',
          attributes: ['id', 'property_name'],
        },
        {
          model: User,
          as: 'assigner',
          attributes: ['id', 'username', 'email'],
        },
      ],
      order: [['assignedAt', 'DESC']],
    })

    const enrichedAssignments = await enrichAssignmentsWithAssigneeDetails(assignments)

    return res.status(200).json(successResponse('Active assignments retrieved successfully', enrichedAssignments))
  } catch (error) {
    console.error('Error retrieving active assignments:', error)
    return res.status(500).json(errorResponse('Failed to retrieve active assignments'))
  }
}

// ─── From bulk.controller.ts ───────────────────────────────────────────
export const generateBulkAssetTemplate = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { categoryId, itemId, vendorId, numberOfRecords = 10 } = req.body

    const category = await AssetCategory.findByPk(categoryId)
    if (!category) {
      throw new AppError('Category not found', 404)
    }

    const item = await AssetItem.findByPk(itemId)
    if (!item) {
      throw new AppError('Item not found', 404)
    }

    let vendor: AssetVendor | null = null
    if (vendorId) {
      vendor = await AssetVendor.findByPk(vendorId)
      if (!vendor) {
        throw new AppError('Vendor not found', 404)
      }
    }

    const sampleRows: Record<string, unknown>[] = []
    const numRows = Math.min(Math.max(1, Number(numberOfRecords)), 1000)

    for (let i = 1; i <= numRows; i++) {
      const serialNum = `SN-${item.name.substring(0, 3).toUpperCase()}-${String(i).padStart(4, '0')}`
      const assetTag = `TAG-${String(i).padStart(5, '0')}`

      sampleRows.push({
        'Serial Number': serialNum,
        'Asset Tag': assetTag,
        'QR Code': `QR-${assetTag}`,
        'Purchase Date (YYYY-MM-DD)': new Date().toISOString().split('T')[0],
        'Purchase Price': 1000,
        'Current Value': 1000,
        'Warranty End Date (YYYY-MM-DD)': new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        'Condition (excellent/good/fair/poor)': 'good',
        'Status (available/assigned/maintenance/retired/disposed)': 'available',
        Notes: `Bulk imported asset #${i}`,
      })
    }

    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet(sampleRows)

    worksheet['!cols'] = [
      { wch: 20 },
      { wch: 15 },
      { wch: 20 },
      { wch: 25 },
      { wch: 15 },
      { wch: 15 },
      { wch: 30 },
      { wch: 35 },
      { wch: 45 },
      { wch: 30 },
    ]

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Bulk Asset Import')

    const metadataRows = [
      { Parameter: 'Category ID', Value: categoryId },
      { Parameter: 'Category Name', Value: category.name },
      { Parameter: 'Item ID', Value: itemId },
      { Parameter: 'Item Name', Value: item.name },
      { Parameter: 'Vendor ID', Value: vendorId || 'N/A' },
      { Parameter: 'Vendor Name', Value: vendor ? vendor.name : 'N/A' },
      { Parameter: 'Generated At', Value: new Date().toISOString() },
    ]
    const metadataSheet = XLSX.utils.json_to_sheet(metadataRows)
    XLSX.utils.book_append_sheet(workbook, metadataSheet, '_Metadata')

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Bulk_Asset_Template_${item.name.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`,
    )

    return res.send(buffer)
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error generating template:', error)
    return res.status(500).json(errorResponse('Failed to generate template'))
  }
}

export const processBulkAssetUpload = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      throw new AppError('No file uploaded', 400)
    }

    const { categoryId, itemId, vendorId, locationId } = req.body

    if (!categoryId || !itemId || !locationId) {
      throw new AppError('categoryId, itemId, and locationId are required', 400)
    }

    const category = await AssetCategory.findByPk(categoryId)
    if (!category) {
      throw new AppError('Category not found', 404)
    }

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

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      throw new AppError('Excel file has no valid sheets', 400)
    }
    const worksheet = workbook.Sheets[sheetName]
    if (!worksheet) {
      throw new AppError('Worksheet not found in Excel file', 400)
    }

    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet)

    if (!rows || rows.length === 0) {
      throw new AppError('Excel file is empty or has no valid data', 400)
    }

    const createdAssets: unknown[] = []
    const errors: { row: number; error: string }[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row) continue
      const rowNum = i + 2

      try {
        const serialNumber = row['Serial Number'] ? String(row['Serial Number']).trim() : null
        const assetTag = row['Asset Tag'] ? String(row['Asset Tag']).trim() : null
        const qrCode = row['QR Code'] ? String(row['QR Code']).trim() : null
        const purchaseDateStr = row['Purchase Date (YYYY-MM-DD)']
          ? String(row['Purchase Date (YYYY-MM-DD)']).trim()
          : null
        const purchasePrice = row['Purchase Price'] ? Number(row['Purchase Price']) : null
        const currentValue = row['Current Value'] ? Number(row['Current Value']) : purchasePrice
        const warrantyEndDateStr = row['Warranty End Date (YYYY-MM-DD)']
          ? String(row['Warranty End Date (YYYY-MM-DD)']).trim()
          : null
        const condition = row['Condition (excellent/good/fair/poor)']
          ? String(row['Condition (excellent/good/fair/poor)']).trim().toLowerCase()
          : 'good'
        const status = row['Status (available/assigned/maintenance/retired/disposed)']
          ? String(row['Status (available/assigned/maintenance/retired/disposed)']).trim().toLowerCase()
          : 'available'
        const notes = row['Notes'] ? String(row['Notes']).trim() : null

        const validConditions = ['excellent', 'good', 'fair', 'poor']
        if (!validConditions.includes(condition)) {
          errors.push({
            row: rowNum,
            error: `Invalid condition '${condition}'. Must be one of: ${validConditions.join(', ')}`,
          })
          continue
        }

        const validStatuses = ['available', 'assigned', 'maintenance', 'retired', 'disposed']
        if (!validStatuses.includes(status)) {
          errors.push({
            row: rowNum,
            error: `Invalid status '${status}'. Must be one of: ${validStatuses.join(', ')}`,
          })
          continue
        }

        let purchaseDate: Date | null = null
        if (purchaseDateStr) {
          purchaseDate = new Date(purchaseDateStr)
          if (isNaN(purchaseDate.getTime())) {
            errors.push({
              row: rowNum,
              error: `Invalid purchase date format '${purchaseDateStr}'`,
            })
            continue
          }
        }

        let warrantyEndDate: Date | null = null
        if (warrantyEndDateStr) {
          warrantyEndDate = new Date(warrantyEndDateStr)
          if (isNaN(warrantyEndDate.getTime())) {
            errors.push({
              row: rowNum,
              error: `Invalid warranty end date format '${warrantyEndDateStr}'`,
            })
            continue
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
          currentValue,
          warrantyEndDate,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          condition: condition as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          status: status as any,
          notes,
          createdBy: req.user?.id || null,
        })

        createdAssets.push(asset)
      } catch (rowError: unknown) {
        const err = rowError as Error
        errors.push({
          row: rowNum,
          error: err.message || 'Failed to process row',
        })
      }
    }

    return res.status(200).json(
      successResponse('Bulk upload completed', {
        totalProcessed: rows.length,
        successfullyCreated: createdAssets.length,
        failedCount: errors.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
    )
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json(errorResponse(error.message))
    }
    console.error('Error processing bulk upload:', error)
    return res.status(500).json(errorResponse('Failed to process bulk upload'))
  }
}

// ─── From category.controller.ts ───────────────────────────────────────────
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

// ─── From compliance.controller.ts ───────────────────────────────────────────
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

// ─── From item.controller.ts ───────────────────────────────────────────
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

// ─── From maintenance.controller.ts ───────────────────────────────────────────
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

// ─── From vendor.controller.ts ───────────────────────────────────────────
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
