import type { Response } from 'express'
import { Op } from 'sequelize'
import { AppointmentStatus } from '../../../enums/appointment.enum.js'
import { ShiftEmployeeDateStatus } from '../../../enums/roster.enum.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import {
  DoctorAppointment,
  Resident,
  ResidentFamilyMember,
  Shift,
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

type AssignmentWithRelations = ShiftAssignment & {
  employee?: User & { profile?: UserDetail }
  shift?: ShiftWithTimes
  workingDays?: string[] | null
  slotTimeRange?: string | null
  areaId?: string | null
  startDate?: string
  endDate?: string
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
 * Doctor-scoped shift/roster days for the logged-in visiting doctor.
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
          include: [
            {
              model: Shift,
              as: 'shift',
              attributes: ['id', 'name', 'startTime', 'endTime'],
            },
          ],
        },
      ],
      order: [['date', 'ASC']],
    })) as ShiftDateWithAssignment[]

    const shifts = []
    for (const sd of shiftDates) {
      const assignment = sd.shiftAssignment
      const shift = assignment?.shift
      const timeRange =
        assignment?.slotTimeRange ||
        (shift?.startTime && shift?.endTime ? `${shift.startTime} - ${shift.endTime}` : null)

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

    const shiftDate = (await ShiftDate.findOne({
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
            {
              model: Shift,
              as: 'shift',
              attributes: ['id', 'name', 'startTime', 'endTime'],
            },
          ],
        },
      ],
    })) as ShiftDateWithAssignment | null

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
    const timeRange =
      shiftDate.shiftAssignment?.slotTimeRange ||
      (shift?.startTime && shift?.endTime ? `${shift.startTime} - ${shift.endTime}` : null)

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
