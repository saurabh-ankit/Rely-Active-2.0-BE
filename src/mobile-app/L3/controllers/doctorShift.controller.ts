import type { Response } from 'express'
import { Op, Sequelize, type WhereOptions } from 'sequelize'
import sequelize from '../../../config/db/index.js'
import { AppointmentStatus } from '../../../enums/appointment.enum.js'
import { ShiftEmployeeDateStatus } from '../../../enums/roster.enum.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import {
  DoctorAppointment,
  PropertyBlock,
  PropertyFloor,
  PropertyUnit,
  Resident,
  ResidentFamilyMember,
  Shift,
  ShiftArea,
  ShiftAssignment,
  ShiftDate,
  User,
  UserDetail,
} from '../../../models/index.js'
import { todayYmdLocal } from '../../../utils/roster.util.js'
import { resolveUserLocationId } from './medical.controller.js'

const ACTIVE_BOOKING_STATUSES = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.ATTENDED]

const WEEK_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

type ShiftWithTimes = Shift & {
  name?: string
  startTime?: string
  endTime?: string
}

type AreaRel = { id?: string; areaName?: string }
type BlockRel = { id?: string; block_name?: string }
type FloorRel = { id?: string; floor_name?: string | null; floor_number?: number | null }
type UnitRel = { id?: string; unit_number?: string }

type AssignmentWithRelations = ShiftAssignment & {
  employee?: User & { profile?: UserDetail }
  shift?: ShiftWithTimes
  workingDays?: string[] | null
  slotTimeRange?: string | null
  areaId?: string | null
  blockId?: string | null
  floorId?: string | null
  unitId?: string | null
  startDate?: string
  endDate?: string
  area?: AreaRel | null
  block?: BlockRel | null
  floor?: FloorRel | null
  unit?: UnitRel | null
}

type ShiftDateWithAssignment = ShiftDate & {
  shiftAssignment?: AssignmentWithRelations
}

function formatResident(resident: Resident) {
  const data = resident.toJSON ? (resident.toJSON() as Resident) : resident
  return {
    id: data.id,
    firstName: data.firstName,
    lastName: data.lastName,
    fullName: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
    username: data.username,
    profilePhoto: data.photoUrl,
    contact_email: data.email,
    contact_phone: data.phone,
    dob: data.dob,
    gender: data.gender,
  }
}

function formatFamilyMember(fm: ResidentFamilyMember) {
  const data = fm.toJSON ? (fm.toJSON() as ResidentFamilyMember) : fm
  return {
    id: data.id,
    firstName: data.firstName,
    lastName: data.lastName,
    fullName: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
    relation: data.relation,
    profilePhoto: data.photoUrl,
    contact_email: data.email,
    contact_phone: data.phone,
  }
}

function formatPatientDisplay(resident?: Resident | null, familyMember?: ResidentFamilyMember | null) {
  if (familyMember) {
    const fm = formatFamilyMember(familyMember)
    return {
      ...fm,
      isFamilyMember: true,
      displayLabel: fm.fullName || 'Family Member',
    }
  }
  if (resident) {
    const r = formatResident(resident)
    return {
      ...r,
      isFamilyMember: false,
      displayLabel: r.fullName || 'Resident',
    }
  }
  return null
}

function formatDoctor(employee?: (User & { profile?: UserDetail }) | null) {
  if (!employee) return null
  const data = employee.toJSON ? (employee.toJSON() as User & { profile?: UserDetail }) : employee
  const firstName = data.profile?.firstName || ''
  const lastName = data.profile?.lastName || ''
  return {
    id: data.id,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim() || data.username || data.email || 'Doctor',
    email: data.email,
    username: data.username,
  }
}

function ymdFromDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function buildLocationLabel(assignment?: AssignmentWithRelations | null): string | null {
  if (!assignment) return null
  if (assignment.area?.areaName) return assignment.area.areaName

  const parts: string[] = []
  if (assignment.block?.block_name) parts.push(assignment.block.block_name)
  if (assignment.floor) {
    parts.push(assignment.floor.floor_name || `Floor ${assignment.floor.floor_number}`)
  }
  if (assignment.unit?.unit_number) {
    parts.push(assignment.unit.unit_number)
  } else if (assignment.floorId && !assignment.unitId) {
    parts.push('Entire floor')
  } else if (assignment.blockId && !assignment.floorId) {
    parts.push('Entire block')
  }
  return parts.length ? parts.join(' · ') : null
}

function formatAssignmentLocation(assignment?: AssignmentWithRelations | null) {
  return {
    locationLabel: buildLocationLabel(assignment),
    blockId: assignment?.blockId || null,
    floorId: assignment?.floorId || null,
    unitId: assignment?.unitId || null,
    areaId: assignment?.areaId || null,
    blockName: assignment?.block?.block_name || null,
    floorName: assignment?.floor?.floor_name || null,
    floorNumber: assignment?.floor?.floor_number ?? null,
    unitNumber: assignment?.unit?.unit_number || null,
    areaName: assignment?.area?.areaName || null,
  }
}

function assignmentIncludeForLocation() {
  return [
    {
      model: Shift,
      as: 'shift',
      attributes: ['id', 'name', 'startTime', 'endTime'],
    },
    {
      model: ShiftArea,
      as: 'area',
      attributes: ['id', 'areaName'],
      required: false,
    },
    {
      model: PropertyBlock,
      as: 'block',
      attributes: ['id', 'block_name'],
      required: false,
    },
    {
      model: PropertyFloor,
      as: 'floor',
      attributes: ['id', 'floor_name', 'floor_number'],
      required: false,
    },
    {
      model: PropertyUnit,
      as: 'unit',
      attributes: ['id', 'unit_number'],
      required: false,
    },
  ]
}

function buildUnitScopeWhere(assignment: AssignmentWithRelations): WhereOptions | null {
  if (assignment.unitId) {
    return { unitId: assignment.unitId }
  }
  if (assignment.floorId) {
    return Sequelize.literal(
      `EXISTS (SELECT 1 FROM property_units pu WHERE pu.id = Resident.unitId AND pu.floorId = ${sequelize.escape(assignment.floorId)} AND pu.isDeleted = false)`,
    ) as unknown as WhereOptions
  }
  if (assignment.blockId) {
    return Sequelize.literal(
      `EXISTS (SELECT 1 FROM property_units pu JOIN property_floors pf ON pf.id = pu.floorId WHERE pu.id = Resident.unitId AND pf.blockId = ${sequelize.escape(assignment.blockId)} AND pu.isDeleted = false AND pf.isDeleted = false)`,
    ) as unknown as WhereOptions
  }
  return null
}

async function loadDoctorShiftDate(
  shiftEmployeeDateId: string,
  doctorId: string,
  locationId: string,
): Promise<ShiftDateWithAssignment | null> {
  return (await ShiftDate.findOne({
    where: { id: shiftEmployeeDateId, locationId, isDeleted: false },
    include: [
      {
        model: ShiftAssignment,
        as: 'shiftAssignment',
        where: { isDeleted: false, employeeId: doctorId },
        required: true,
        include: [
          {
            model: User,
            as: 'employee',
            attributes: ['id', 'email', 'username'],
            include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
          },
          ...assignmentIncludeForLocation(),
        ],
      },
    ],
  })) as ShiftDateWithAssignment | null
}

function resolveShiftTimeRange(assignment?: AssignmentWithRelations | null): string | null {
  const shift = assignment?.shift
  return (
    assignment?.slotTimeRange || (shift?.startTime && shift?.endTime ? `${shift.startTime} - ${shift.endTime}` : null)
  )
}

/**
 * Ensure ShiftDate rows exist for the doctor's assignments in [rangeStart, rangeEnd].
 */
async function ensureDoctorShiftDates(
  doctorId: string,
  locationId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<void> {
  const assignments = (await ShiftAssignment.findAll({
    where: {
      locationId,
      employeeId: doctorId,
      isDeleted: false,
      endDate: { [Op.gte]: rangeStart },
      startDate: { [Op.lte]: rangeEnd },
    },
  })) as AssignmentWithRelations[]

  for (const assignment of assignments) {
    const start = assignment.startDate > rangeStart ? assignment.startDate : rangeStart
    const end = assignment.endDate < rangeEnd ? assignment.endDate : rangeEnd
    if (start > end) continue

    const cur = new Date(`${start}T00:00:00`)
    const last = new Date(`${end}T00:00:00`)

    for (let d = new Date(cur); d <= last; d.setDate(d.getDate() + 1)) {
      if (assignment.workingDays && assignment.workingDays.length > 0) {
        const dayName = WEEK_DAYS[d.getDay()]
        if (!dayName || !assignment.workingDays.includes(dayName)) continue
      }
      const dateStr = ymdFromDate(d)

      const existing = await ShiftDate.findOne({
        where: {
          employeeShiftAssignmentId: assignment.id,
          date: dateStr,
          locationId,
          isDeleted: false,
        },
      })
      if (!existing) {
        await ShiftDate.create({
          employeeShiftAssignmentId: assignment.id,
          date: dateStr,
          locationId,
          areaId: assignment.areaId || null,
          status: ShiftEmployeeDateStatus.UPCOMING,
        })
      }
    }
  }
}

/**
 * GET /api/v1/mobile/l3/medical/doctor/shifts?filter=today|upcoming
 * Doctor-scoped shift/roster days for the logged-in doctor (visiting or in-house).
 */
export async function getDoctorShifts(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const doctorId = req.user?.id
    if (!doctorId) {
      res.status(401).json({ success: false, message: 'Unauthorized' })
      return
    }

    const locationId = await resolveUserLocationId(req)
    if (!locationId || locationId === 'all' || locationId === 'global') {
      res.status(400).json({ success: false, message: 'Unable to resolve staff location' })
      return
    }

    const filter = String(req.query.filter || 'upcoming').toLowerCase()
    if (filter !== 'today' && filter !== 'upcoming') {
      res.status(400).json({ success: false, message: 'filter must be today or upcoming' })
      return
    }

    const today = todayYmdLocal()
    const horizon = new Date()
    horizon.setDate(horizon.getDate() + 45)
    const horizonStr = todayYmdLocal(horizon)

    const ensureStart = filter === 'today' ? today : today
    const ensureEnd = filter === 'today' ? today : horizonStr
    await ensureDoctorShiftDates(doctorId, locationId, ensureStart, ensureEnd)

    const dateWhere = filter === 'today' ? { date: today } : { date: { [Op.gt]: today, [Op.lte]: horizonStr } }

    const shiftDates = (await ShiftDate.findAll({
      where: {
        locationId,
        isDeleted: false,
        ...dateWhere,
        status: { [Op.notIn]: [ShiftEmployeeDateStatus.DAY_OFF, ShiftEmployeeDateStatus.ABSENT] },
      },
      include: [
        {
          model: ShiftAssignment,
          as: 'shiftAssignment',
          where: {
            isDeleted: false,
            employeeId: doctorId,
          },
          required: true,
          include: assignmentIncludeForLocation(),
        },
      ],
      order: [['date', 'ASC']],
    })) as ShiftDateWithAssignment[]

    const shifts = []
    for (const sd of shiftDates) {
      const assignment = sd.shiftAssignment
      const shift = assignment?.shift
      const timeRange = resolveShiftTimeRange(assignment)
      const location = formatAssignmentLocation(assignment)

      const bookedCount = await DoctorAppointment.count({
        where: {
          shiftEmployeeDateId: sd.id,
          locationId,
          isDeleted: false,
          status: { [Op.in]: ACTIVE_BOOKING_STATUSES },
        },
      })

      shifts.push({
        shiftEmployeeDateId: sd.id,
        date: sd.date,
        status: sd.status,
        shiftName: shift?.name || 'Shift',
        timeRange,
        shift: shift
          ? {
              id: shift.id,
              name: shift.name,
              startTime: shift.startTime,
              endTime: shift.endTime,
            }
          : null,
        bookedCount,
        ...location,
      })
    }

    res.status(200).json({
      success: true,
      message: 'Doctor shifts fetched successfully',
      data: { shifts },
    })
  } catch (err) {
    console.error('Get Doctor Shifts Error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch doctor shifts' })
  }
}

/**
 * GET /api/v1/mobile/l3/medical/doctor/shifts/:shiftEmployeeDateId/bookings
 * Appointment bookings for a shift day owned by the logged-in doctor.
 */
export async function getDoctorShiftBookings(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const doctorId = req.user?.id
    if (!doctorId) {
      res.status(401).json({ success: false, message: 'Unauthorized' })
      return
    }

    const locationId = await resolveUserLocationId(req)
    if (!locationId || locationId === 'all' || locationId === 'global') {
      res.status(400).json({ success: false, message: 'Unable to resolve staff location' })
      return
    }

    const shiftEmployeeDateId = String(req.params.shiftEmployeeDateId || '').trim()
    if (!shiftEmployeeDateId) {
      res.status(400).json({ success: false, message: 'shiftEmployeeDateId is required' })
      return
    }

    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1)
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '50'), 10) || 50))
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : ''
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''

    const shiftDate = await loadDoctorShiftDate(shiftEmployeeDateId, doctorId, locationId)

    if (!shiftDate) {
      res.status(404).json({ success: false, message: 'Doctor shift date not found' })
      return
    }

    const offset = (page - 1) * limit
    const whereClause: Record<string, unknown> = {
      shiftEmployeeDateId,
      locationId,
      isDeleted: false,
    }
    if (status) whereClause.status = status

    const { count, rows } = await DoctorAppointment.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Resident,
          as: 'resident',
          attributes: ['id', 'firstName', 'lastName', 'username', 'photoUrl', 'email', 'phone', 'dob', 'gender'],
          required: true,
        },
        {
          model: ResidentFamilyMember,
          as: 'familyMember',
          attributes: ['id', 'firstName', 'lastName', 'relation', 'photoUrl', 'email', 'phone'],
          required: false,
        },
      ],
      order: [['bookedAt', 'DESC']],
      limit,
      offset,
    })

    let filteredRows = rows
    if (search) {
      const q = search.toLowerCase()
      filteredRows = rows.filter((row) => {
        const data = row.toJSON() as DoctorAppointment & {
          resident?: Resident
          familyMember?: ResidentFamilyMember
        }
        const haystack = [
          data.resident?.firstName,
          data.resident?.lastName,
          data.resident?.email,
          data.resident?.phone,
          data.resident?.username,
          data.familyMember?.firstName,
          data.familyMember?.lastName,
          data.familyMember?.email,
          data.familyMember?.phone,
          data.familyMember?.relation,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })
    }

    const doctor = formatDoctor(shiftDate.shiftAssignment?.employee)
    const shift = shiftDate.shiftAssignment?.shift
    const shiftName = shift?.name || 'Shift'
    const timeRange = resolveShiftTimeRange(shiftDate.shiftAssignment)
    const location = formatAssignmentLocation(shiftDate.shiftAssignment)

    const bookings = filteredRows.map((row) => {
      const data = row.toJSON() as DoctorAppointment & {
        resident?: Resident
        familyMember?: ResidentFamilyMember
      }
      const resident = data.resident ? formatResident(data.resident) : null
      const familyMember = data.familyMember ? formatFamilyMember(data.familyMember) : null
      const patient = formatPatientDisplay(data.resident, data.familyMember)
      return {
        id: data.id,
        shiftEmployeeDateId: data.shiftEmployeeDateId,
        residentId: data.residentId,
        familyMemberId: data.familyMemberId || null,
        doctorId: data.doctorId,
        appointmentDate: data.appointmentDate,
        slotTimeRange: data.slotTimeRange,
        status: data.status,
        bookedAt: data.bookedAt,
        cancelledAt: data.cancelledAt,
        cancellationReason: data.cancellationReason,
        attendedAt: data.attendedAt,
        notes: data.notes,
        resident,
        familyMember,
        patient,
        doctor,
        shiftName,
      }
    })

    const totalCount = search ? bookings.length : count

    res.status(200).json({
      success: true,
      message: 'Appointment bookings retrieved successfully',
      data: {
        shift: {
          shiftEmployeeDateId: shiftDate.id,
          date: shiftDate.date,
          status: shiftDate.status,
          shiftName,
          timeRange,
          ...location,
        },
        bookings,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit) || 1,
          totalCount,
          limit,
          hasNextPage: offset + limit < totalCount,
          hasPrevPage: page > 1,
          nextPage: offset + limit < totalCount ? page + 1 : null,
          prevPage: page > 1 ? page - 1 : null,
        },
      },
    })
  } catch (err) {
    console.error('Get Doctor Shift Bookings Error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch appointment bookings' })
  }
}

/**
 * GET /api/v1/mobile/l3/medical/doctor/shifts/:shiftEmployeeDateId/residents
 * Residents living in the shift assignment's tower/floor/flat scope (in-house).
 */
export async function getDoctorShiftResidents(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const doctorId = req.user?.id
    if (!doctorId) {
      res.status(401).json({ success: false, message: 'Unauthorized' })
      return
    }

    const locationId = await resolveUserLocationId(req)
    if (!locationId || locationId === 'all' || locationId === 'global') {
      res.status(400).json({ success: false, message: 'Unable to resolve staff location' })
      return
    }

    const shiftEmployeeDateId = String(req.params.shiftEmployeeDateId || '').trim()
    if (!shiftEmployeeDateId) {
      res.status(400).json({ success: false, message: 'shiftEmployeeDateId is required' })
      return
    }

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1)
    const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit || '50'), 10) || 50))

    const shiftDate = await loadDoctorShiftDate(shiftEmployeeDateId, doctorId, locationId)
    if (!shiftDate) {
      res.status(404).json({ success: false, message: 'Doctor shift date not found' })
      return
    }

    const assignment = shiftDate.shiftAssignment
    if (!assignment) {
      res.status(404).json({ success: false, message: 'Shift assignment not found' })
      return
    }

    const scopeWhere = buildUnitScopeWhere(assignment)
    const andConditions: WhereOptions[] = [{ isDeleted: false }, { isResiding: true }, { locId: locationId }]

    if (scopeWhere) {
      andConditions.push(scopeWhere)
    } else {
      // No unit hierarchy on assignment → empty list (visiting should use bookings)
      res.status(200).json({
        success: true,
        message: 'Shift residents fetched successfully',
        data: {
          shift: {
            shiftEmployeeDateId: shiftDate.id,
            date: shiftDate.date,
            status: shiftDate.status,
            shiftName: assignment.shift?.name || 'Shift',
            timeRange: resolveShiftTimeRange(assignment),
            ...formatAssignmentLocation(assignment),
          },
          residents: [],
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalCount: 0,
            limit,
            hasNextPage: false,
            hasPrevPage: false,
          },
        },
      })
      return
    }

    if (search) {
      const escaped = sequelize.escape(`%${search}%`)
      andConditions.push({
        [Op.or]: [
          { firstName: { [Op.like]: `%${search}%` } },
          { lastName: { [Op.like]: `%${search}%` } },
          { phone: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } },
          Sequelize.literal(
            `EXISTS (SELECT 1 FROM property_units pu WHERE pu.id = Resident.unitId AND pu.unit_number LIKE ${escaped})`,
          ),
        ],
      })
    }

    const where = { [Op.and]: andConditions }
    const total = await Resident.count({ where })
    const totalPages = Math.max(1, Math.ceil(total / limit) || 1)
    const safePage = Math.min(page, totalPages)
    const offset = (safePage - 1) * limit

    const residents = await Resident.findAll({
      where,
      include: [
        {
          model: PropertyUnit,
          as: 'unit',
          attributes: ['id', 'unit_number', 'unit_type', 'floorId'],
          include: [
            {
              model: PropertyFloor,
              as: 'floor',
              attributes: ['id', 'floor_number', 'floor_name', 'blockId'],
              include: [
                {
                  model: PropertyBlock,
                  as: 'block',
                  attributes: ['id', 'block_name'],
                  required: false,
                },
              ],
              required: false,
            },
          ],
          required: false,
        },
      ],
      order: [
        ['firstName', 'ASC'],
        ['lastName', 'ASC'],
      ],
      limit,
      offset,
    })

    const formatted = residents.map((r) => {
      const unit = r.unit as
        | (PropertyUnit & {
            floor?: (PropertyFloor & { block?: PropertyBlock | null }) | null
          })
        | null
        | undefined

      const unitParts = [
        unit?.floor?.block?.block_name || null,
        unit?.floor?.floor_name || (unit?.floor?.floor_number != null ? `Floor ${unit.floor.floor_number}` : null),
        unit?.unit_number || null,
      ].filter(Boolean)

      return {
        id: r.id,
        firstName: r.firstName,
        lastName: r.lastName || '',
        fullName: `${r.firstName} ${r.lastName || ''}`.trim(),
        phone: r.phone || null,
        email: r.email || null,
        photoUrl: r.photoUrl || null,
        gender: r.gender || null,
        dob: r.dob || null,
        unit: unit
          ? {
              id: unit.id,
              unitNumber: unit.unit_number,
              unitType: unit.unit_type,
              floorNumber: unit.floor?.floor_number ?? null,
              floorName: unit.floor?.floor_name ?? null,
              blockName: unit.floor?.block?.block_name ?? null,
            }
          : null,
        locationLabel: unitParts.length ? unitParts.join(' · ') : null,
      }
    })

    const shift = assignment.shift
    const location = formatAssignmentLocation(assignment)

    res.status(200).json({
      success: true,
      message: 'Shift residents fetched successfully',
      data: {
        shift: {
          shiftEmployeeDateId: shiftDate.id,
          date: shiftDate.date,
          status: shiftDate.status,
          shiftName: shift?.name || 'Shift',
          timeRange: resolveShiftTimeRange(assignment),
          ...location,
        },
        residents: formatted,
        pagination: {
          currentPage: safePage,
          totalPages,
          totalCount: total,
          limit,
          hasNextPage: safePage < totalPages,
          hasPrevPage: safePage > 1,
        },
      },
    })
  } catch (err) {
    console.error('Get Doctor Shift Residents Error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch shift residents' })
  }
}

/**
 * POST /api/v1/mobile/l3/medical/doctor/shifts/:shiftEmployeeDateId/residents/:residentId/ensure-appointment
 * Find-or-create a DoctorAppointment so in-house doctors can use the visiting clinical flow.
 */
export async function ensureDoctorShiftAppointment(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const doctorId = req.user?.id
    if (!doctorId) {
      res.status(401).json({ success: false, message: 'Unauthorized' })
      return
    }

    const locationId = await resolveUserLocationId(req)
    if (!locationId || locationId === 'all' || locationId === 'global') {
      res.status(400).json({ success: false, message: 'Unable to resolve staff location' })
      return
    }

    const shiftEmployeeDateId = String(req.params.shiftEmployeeDateId || '').trim()
    const residentId = String(req.params.residentId || '').trim()
    if (!shiftEmployeeDateId || !residentId) {
      res.status(400).json({ success: false, message: 'shiftEmployeeDateId and residentId are required' })
      return
    }

    const shiftDate = await loadDoctorShiftDate(shiftEmployeeDateId, doctorId, locationId)
    if (!shiftDate) {
      res.status(404).json({ success: false, message: 'Doctor shift date not found' })
      return
    }

    const assignment = shiftDate.shiftAssignment
    if (!assignment) {
      res.status(404).json({ success: false, message: 'Shift assignment not found' })
      return
    }

    const scopeWhere = buildUnitScopeWhere(assignment)
    const andConditions: WhereOptions[] = [
      { id: residentId },
      { isDeleted: false },
      { isResiding: true },
      { locId: locationId },
    ]
    if (scopeWhere) {
      andConditions.push(scopeWhere)
    } else {
      res.status(400).json({
        success: false,
        message: 'This shift has no unit assignment; use booked appointments instead',
      })
      return
    }

    const resident = await Resident.findOne({ where: { [Op.and]: andConditions } })
    if (!resident) {
      res.status(404).json({ success: false, message: 'Resident not found in this shift scope' })
      return
    }

    const existing = await DoctorAppointment.findOne({
      where: {
        shiftEmployeeDateId,
        residentId,
        doctorId,
        locationId,
        isDeleted: false,
        status: { [Op.ne]: AppointmentStatus.CANCELLED },
      },
      order: [['bookedAt', 'DESC']],
    })

    if (existing) {
      res.status(200).json({
        success: true,
        message: 'Appointment already exists',
        data: {
          appointmentId: existing.id,
          created: false,
          appointment: {
            id: existing.id,
            shiftEmployeeDateId: existing.shiftEmployeeDateId,
            residentId: existing.residentId,
            doctorId: existing.doctorId,
            appointmentDate: existing.appointmentDate,
            slotTimeRange: existing.slotTimeRange,
            status: existing.status,
          },
        },
      })
      return
    }

    const timeRange = resolveShiftTimeRange(assignment) || '00:00 - 23:59'
    const created = await DoctorAppointment.create({
      locationId,
      shiftEmployeeDateId,
      residentId,
      doctorId,
      appointmentDate: shiftDate.date,
      slotTimeRange: timeRange,
      status: AppointmentStatus.CONFIRMED,
      bookedAt: new Date(),
      isActive: true,
      isDeleted: false,
      createdBy: doctorId,
      updatedBy: doctorId,
    })

    res.status(201).json({
      success: true,
      message: 'Appointment created successfully',
      data: {
        appointmentId: created.id,
        created: true,
        appointment: {
          id: created.id,
          shiftEmployeeDateId: created.shiftEmployeeDateId,
          residentId: created.residentId,
          doctorId: created.doctorId,
          appointmentDate: created.appointmentDate,
          slotTimeRange: created.slotTimeRange,
          status: created.status,
        },
      },
    })
  } catch (err) {
    console.error('Ensure Doctor Shift Appointment Error:', err)
    res.status(500).json({ success: false, message: 'Failed to ensure appointment' })
  }
}
