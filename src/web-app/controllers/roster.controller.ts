import { Response } from 'express'
import { Op } from 'sequelize'
import sequelize from '../../config/db/index.js'
import { RosterAreaStatus } from '../../enums/roster.enum.js'
import { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import { ShiftAssignment, Property, ShiftArea } from '../../models/index.js'
import { asParamString } from '../../utils/roster.util.js'
import { errorResponse, successResponse } from '../../utils/response/index.js'

const propertyInclude = {
  model: Property,
  as: 'property',
  attributes: ['id', 'property_name', 'isActive'],
}

export const createArea = async (req: AuthenticatedRequest, res: Response) => {
  const transaction = await sequelize.transaction()
  const locationId = asParamString(req.params.locationId)

  try {
    const { areaName, areaType, location, capacity, status = RosterAreaStatus.ACTIVE, description } = req.body
    const createdBy = req.user?.id

    if (locationId === 'all') {
      await transaction.rollback()
      return res.status(400).json(errorResponse("Cannot create area for 'all' locations. Please specify a location."))
    }

    const locationRecord = await Property.findByPk(locationId, { transaction })
    if (!locationRecord) {
      await transaction.rollback()
      return res.status(404).json(errorResponse('Location not found'))
    }

    const area = await ShiftArea.create(
      {
        areaName: String(areaName).trim(),
        areaType,
        location: String(location).trim(),
        capacity: capacity?.trim(),
        status,
        description: description?.trim(),
        locationId,
        createdBy: createdBy || null,
        updatedBy: createdBy || null,
      },
      { transaction },
    )

    await transaction.commit()

    const areaWithDetails = await ShiftArea.findByPk(area.id, {
      include: [propertyInclude],
    })

    return res.status(201).json(successResponse('Area created successfully', { area: areaWithDetails }))
  } catch (error) {
    await transaction.rollback()
    console.error('Error creating area:', error)
    return res.status(500).json(errorResponse('Failed to create area'))
  }
}

export const getAreas = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    const { page = 1, limit = 10, search = '', sortBy = 'createdAt', sortOrder = 'DESC', areaType, status } = req.query

    const offset = (Number(page) - 1) * Number(limit)
    const whereConditions: Record<string, unknown> = {
      locationId,
      isDeleted: false,
    }

    if (search) {
      whereConditions[Op.or as unknown as string] = [
        { areaName: { [Op.like]: `%${search}%` } },
        { location: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
      ]
    }
    if (areaType) whereConditions.areaType = areaType
    if (status) whereConditions.status = status

    const { count, rows: areas } = await ShiftArea.findAndCountAll({
      where: whereConditions,
      include: [propertyInclude],
      order: [[sortBy as string, sortOrder as string]],
      limit: Number(limit),
      offset,
      distinct: true,
    })

    const summary = {
      totalAreas: count,
      activeAreas: areas.filter((a) => a.status === RosterAreaStatus.ACTIVE).length,
      inactiveAreas: areas.filter((a) => a.status === RosterAreaStatus.INACTIVE).length,
    }

    return res.status(200).json(
      successResponse('Areas retrieved successfully', {
        areas,
        summary,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(count / Number(limit)),
          totalItems: count,
          itemsPerPage: Number(limit),
        },
      }),
    )
  } catch (error) {
    console.error('Error fetching areas:', error)
    return res.status(500).json(errorResponse('Failed to fetch areas'))
  }
}

export const updateArea = async (req: AuthenticatedRequest, res: Response) => {
  const transaction = await sequelize.transaction()
  const areaId = asParamString(req.params.areaId)

  try {
    const { areaName, areaType, location, capacity, status, description } = req.body
    const updatedBy = req.user?.id

    const area = await ShiftArea.findByPk(areaId, { transaction })
    if (!area || area.isDeleted) {
      await transaction.rollback()
      return res.status(404).json(errorResponse('Area not found'))
    }

    await area.update(
      {
        areaName: areaName?.trim(),
        areaType,
        location: location?.trim(),
        capacity: capacity?.trim(),
        status,
        description: description?.trim(),
        updatedBy: updatedBy || null,
      } as never,
      { transaction },
    )

    await transaction.commit()

    const updatedArea = await ShiftArea.findByPk(area.id, { include: [propertyInclude] })
    return res.status(200).json(successResponse('Area updated successfully', { area: updatedArea }))
  } catch (error) {
    await transaction.rollback()
    console.error('Error updating area:', error)
    return res.status(500).json(errorResponse('Failed to update area'))
  }
}

export const deleteArea = async (req: AuthenticatedRequest, res: Response) => {
  const transaction = await sequelize.transaction()
  const areaId = asParamString(req.params.areaId)

  try {
    const updatedBy = req.user?.id
    const area = await ShiftArea.findByPk(areaId, { transaction })
    if (!area || area.isDeleted) {
      await transaction.rollback()
      return res.status(404).json(errorResponse('Area not found'))
    }

    const activeAssignment = await ShiftAssignment.findOne({
      where: {
        areaId,
        isActive: true,
        isDeleted: false,
      },
      transaction,
    })

    if (activeAssignment) {
      await transaction.rollback()
      return res
        .status(400)
        .json(errorResponse('Cannot delete area. This area has active shift assignments. Please remove them first.'))
    }

    await area.update({ isDeleted: true, updatedBy: updatedBy || null } as never, { transaction })
    await transaction.commit()
    return res.status(200).json(successResponse('Area deleted successfully'))
  } catch (error) {
    await transaction.rollback()
    console.error('Error deleting area:', error)
    return res.status(500).json(errorResponse('Failed to delete area'))
  }
}
