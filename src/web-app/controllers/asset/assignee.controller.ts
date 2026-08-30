import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import type { Includeable } from 'sequelize'
import { Property, User, UserLocation } from '../../../models/index.js'
import { errorResponse, successResponse } from '../../../utils/response/index.js'

export const getEmployeesForAssignment = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = req.params.locationId as string | undefined

    const whereClause: Record<string, unknown> = {
      isActive: true,
    }

    let includeClause: Includeable[] = []
    if (locationId && locationId !== 'all') {
      includeClause = [
        {
          model: UserLocation,
          as: 'userLocations',
          attributes: [],
          where: {
            locId: locationId,
            isActive: true,
          },
          required: true,
        },
      ]
    }

    const employees = await User.findAll({
      where: whereClause,
      include: includeClause,
      attributes: ['id', 'username', 'email', 'phone'],
      order: [['username', 'ASC']],
      limit: 100,
    })

    const formattedEmployees = employees.map((emp) => {
      const empData = emp.toJSON() as unknown as Record<string, unknown>
      return {
        id: empData.id as string,
        name: (empData.username || empData.email || 'Unknown Employee') as string,
        email: empData.email,
        phone: empData.phone,
      }
    })

    return res.status(200).json(successResponse('Employees fetched successfully', formattedEmployees))
  } catch (error) {
    console.error('Error fetching employees:', error)
    return res.status(500).json(errorResponse('Failed to fetch employees'))
  }
}

export const getPatientsForAssignment = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = req.params.locationId as string | undefined

    const whereClause: Record<string, unknown> = {
      isActive: true,
    }

    let includeClause: Includeable[] = []
    if (locationId && locationId !== 'all') {
      includeClause = [
        {
          model: UserLocation,
          as: 'userLocations',
          attributes: [],
          where: {
            locId: locationId,
            isActive: true,
          },
          required: true,
        },
      ]
    }

    const users = await User.findAll({
      where: whereClause,
      include: includeClause,
      attributes: ['id', 'username', 'email'],
      order: [['username', 'ASC']],
      limit: 100,
    })

    const formattedPatients = users.map((user) => {
      const uData = user.toJSON() as unknown as Record<string, unknown>
      const idStr = String(uData.id || '')
      return {
        id: uData.id as string,
        name: (uData.username || uData.email || 'Unknown Resident') as string,
        patientNumber: idStr.slice(0, 8),
      }
    })

    return res.status(200).json(successResponse('Patients fetched successfully', formattedPatients))
  } catch (error) {
    console.error('Error fetching patients:', error)
    return res.status(500).json(errorResponse('Failed to fetch patients'))
  }
}

export const getRoomsForAssignment = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = req.params.locationId as string | undefined

    const whereClause: Record<string, unknown> = {}
    if (locationId && locationId !== 'all') {
      whereClause.id = locationId
    }

    const properties = await Property.findAll({
      where: whereClause,
      attributes: ['id', 'property_name', 'property_type'],
      order: [['property_name', 'ASC']],
      limit: 100,
    })

    const formattedRooms = properties.map((prop) => {
      const pData = prop.toJSON() as unknown as Record<string, unknown>
      return {
        id: pData.id as string,
        name: pData.property_name as string,
        roomNumber: pData.property_name as string,
        status: 'available',
      }
    })

    return res.status(200).json(successResponse('Rooms fetched successfully', formattedRooms))
  } catch (error) {
    console.error('Error fetching rooms:', error)
    return res.status(500).json(errorResponse('Failed to fetch rooms'))
  }
}

export const getBedsForRoom = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { roomId } = req.query

    if (!roomId) {
      return res.status(400).json(errorResponse('Room ID is required'))
    }

    const formattedBeds = [
      {
        id: `${roomId}-bed-1`,
        name: 'Bed 1',
        bedNumber: '1',
        status: 'available',
      },
      {
        id: `${roomId}-bed-2`,
        name: 'Bed 2',
        bedNumber: '2',
        status: 'available',
      },
    ]

    return res.status(200).json(successResponse('Beds fetched successfully', formattedBeds))
  } catch (error) {
    console.error('Error fetching beds:', error)
    return res.status(500).json(errorResponse('Failed to fetch beds'))
  }
}
