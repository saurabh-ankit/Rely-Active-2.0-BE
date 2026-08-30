import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import type { Includeable } from 'sequelize'
import { Asset, AssetAssignment, AssetCategory, AssetItem, Property, User } from '../../../models/index.js'
import { AppError } from '../../../utils/appError.js'
import { errorResponse, successResponse } from '../../../utils/response/index.js'

const enrichAssignmentsWithAssigneeDetails = async (assignments: unknown[]) => {
  const enrichedAssignments = await Promise.all(
    assignments.map(async (assignment) => {
      const itemObj = assignment as Record<string, unknown>
      const assignmentData = (typeof itemObj?.toJSON === 'function' ? itemObj.toJSON() : itemObj) as Record<
        string,
        unknown
      >
      let assigneeDetails = null

      if (assignmentData.assigneeType === 'employee' || assignmentData.assigneeType === 'patient') {
        const user = await User.findOne({
          where: { id: assignmentData.assigneeId as string },
          attributes: ['id', 'username', 'email', 'phone'],
        })

        if (user) {
          assigneeDetails = {
            id: user.id,
            name: user.username || user.email || 'Unknown Assignee',
            email: user.email || undefined,
            phone: user.phone || undefined,
          }
        }
      } else if (assignmentData.assigneeType === 'room') {
        const property = await Property.findByPk(assignmentData.assigneeId as string, {
          attributes: ['id', 'property_name'],
        })
        if (property) {
          assigneeDetails = {
            id: property.id,
            name: property.property_name,
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
