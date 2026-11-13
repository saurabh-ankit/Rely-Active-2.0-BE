import { Property, PropertyBlock, PropertyFloor, PropertyUnit, Resident, User } from '../models/index.js'
import type { AssigneeType } from '../enums/asset.enum.js'

export type AssigneeDetails = {
  id: string
  name: string
  email?: string
  phone?: string
  residentType?: unknown
  flatInfo?: string
  unitNumber?: unknown
  floorName?: string
  blockName?: string
}

export async function resolveAssigneeDetails(
  assigneeType: AssigneeType | string,
  assigneeId: string,
): Promise<AssigneeDetails | null> {
  if (assigneeType === 'employee') {
    const user = await User.findOne({
      where: { id: assigneeId },
      attributes: ['id', 'username', 'email', 'phone'],
    })

    if (!user) return null

    return {
      id: user.id,
      name: user.username || user.email || 'Unknown Employee',
      ...(user.email ? { email: user.email } : {}),
      ...(user.phone ? { phone: user.phone } : {}),
    }
  }

  if (assigneeType === 'resident') {
    const resident = await Resident.findByPk(assigneeId, {
      include: [
        {
          model: PropertyUnit,
          as: 'unit',
          include: [{ model: PropertyFloor, as: 'floor' }],
        },
        { model: Property, as: 'property' },
      ],
    })

    if (!resident) return null

    const rData = resident.toJSON() as unknown as Record<string, unknown>
    const name = `${rData.firstName || ''} ${rData.lastName || ''}`.trim()
    const unit = rData.unit as Record<string, unknown> | undefined
    const floor = unit?.floor as Record<string, unknown> | undefined
    const unitNum = unit?.unit_number ? `Unit ${unit.unit_number}` : ''
    const floorLabel = (floor?.floor_name as string) || (floor?.floor_number ? `Floor ${floor.floor_number}` : '')
    const flatInfo = [floorLabel, unitNum].filter(Boolean).join(' — ')

    const residentEmail = typeof rData.email === 'string' ? rData.email : undefined
    const residentPhone = typeof rData.phone === 'string' ? rData.phone : undefined

    return {
      id: resident.id,
      name: name || 'Unknown Resident',
      residentType: rData.residentType,
      flatInfo,
      ...(residentEmail ? { email: residentEmail } : {}),
      ...(residentPhone ? { phone: residentPhone } : {}),
    }
  }

  if (assigneeType === 'flat') {
    const unit = await PropertyUnit.findByPk(assigneeId, {
      include: [
        {
          model: PropertyFloor,
          as: 'floor',
          include: [{ model: PropertyBlock, as: 'block' }],
        },
      ],
    })

    if (!unit) return null

    const uData = unit.toJSON() as unknown as Record<string, unknown>
    const floor = uData.floor as Record<string, unknown> | undefined
    const block = floor?.block as Record<string, unknown> | undefined
    const unitNum = uData.unit_number ? `Unit ${uData.unit_number}` : ''
    const floorLabel = (floor?.floor_name as string) || (floor?.floor_number ? `Floor ${floor.floor_number}` : '')
    const blockLabel = (block?.block_name as string) || ''
    const flatName = [blockLabel, floorLabel, unitNum].filter(Boolean).join(' • ')

    return {
      id: unit.id,
      name: flatName || `Unit ${uData.unit_number}`,
      unitNumber: uData.unit_number,
      floorName: floorLabel,
      blockName: blockLabel,
      flatInfo: flatName,
    }
  }

  return null
}

export async function enrichAssignmentsWithAssigneeDetails(assignments: unknown[]) {
  const enrichedAssignments = await Promise.all(
    assignments.map(async (assignment) => {
      const itemObj = assignment as Record<string, unknown>
      const assignmentData = (typeof itemObj?.toJSON === 'function' ? itemObj.toJSON() : itemObj) as Record<
        string,
        unknown
      >

      const assigneeDetails = await resolveAssigneeDetails(
        assignmentData.assigneeType as string,
        assignmentData.assigneeId as string,
      )

      return {
        ...assignmentData,
        assigneeDetails,
      }
    }),
  )

  return enrichedAssignments
}
