import type { Response } from 'express'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { Op } from 'sequelize'
import { Property, PropertyFloor, PropertyUnit, Resident, Role, User, UserLocation } from '../../../models/index.js'
import { errorResponse, successResponse } from '../../../utils/response/index.js'

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
