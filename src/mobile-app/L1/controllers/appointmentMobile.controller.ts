import type { Response } from 'express'
import { Op } from 'sequelize'
import { AppointmentStatus } from '../../../enums/appointment.enum.js'
import { ShiftEmployeeDateStatus } from '../../../enums/roster.enum.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import {
  DoctorAppointment,
  JobCategory,
  Resident,
  ResidentFamilyMember,
  Role,
  Shift,
  ShiftAssignment,
  ShiftDate,
  User,
  UserDetail,
  UserLocation,
} from '../../../models/index.js'
import { generateAppointmentSlots, isSlotInPast, resolveEffectiveWindow } from '../../../utils/appointment.util.js'
import { asParamString, todayYmdLocal } from '../../../utils/roster.util.js'
import sequelize from '../../../config/db/index.js'
import {
  getDoctorSpecializations,
  getSpecializationsForUsers,
  type DoctorSpecializationSummary,
} from '../../../services/doctorSpecialization.service.js'

const ACTIVE_BOOKING_STATUSES = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.ATTENDED]

type ShiftWithSlots = Shift & {
  numberOfSlots?: number | null
  slotDuration?: number | null
  startTime?: string
  endTime?: string
  name?: string
}

type AssignmentWithRelations = ShiftAssignment & {
  employee?: User & { profile?: UserDetail }
  shift?: ShiftWithSlots
}

type ShiftDateWithAssignment = ShiftDate & {
  shiftAssignment?: AssignmentWithRelations
}

async function resolveResidentContext(req: AuthenticatedRequest): Promise<{
  residentId: string
  locationId: string
  isFamilyMember: boolean
  familyMemberId: string | null
} | null> {
  const roles = req.user?.roles || []
  const isFamilyMember = roles.includes('RESIDENT_FAMILY_MEMBER')
  const familyMemberId = isFamilyMember ? req.user?.id || null : null
  const residentId = req.user?.residentId || (!isFamilyMember ? req.user?.id : null)
  if (!residentId) return null

  const locationId =
    (req.query.locationId as string) ||
    (req.query.locId as string) ||
    req.user?.defaultLocationId ||
    req.locationId ||
    null

  if (locationId) {
    return { residentId: String(residentId), locationId: String(locationId), isFamilyMember, familyMemberId }
  }

  const resident = await Resident.findByPk(residentId)
  if (!resident?.locId) return null
  return {
    residentId: String(residentId),
    locationId: resident.locId,
    isFamilyMember,
    familyMemberId,
  }
}

async function getVisitingDoctorIds(locationId: string): Promise<Set<string>> {
  const jobCats = await JobCategory.findAll({
    where: {
      [Op.or]: [{ code: 'MED_VISITING' }, { name: { [Op.like]: '%visiting%' } }, { name: { [Op.like]: '%Visiting%' } }],
    },
    attributes: ['id', 'code', 'name'],
  })
  const jobCatIds = jobCats
    .filter((j) => {
      const code = (j.code || '').toUpperCase()
      const name = (j.name || '').toLowerCase()
      return code === 'MED_VISITING' || name.includes('visiting')
    })
    .map((j) => j.id)
  if (jobCatIds.length === 0) return new Set()

  const doctorRole = await Role.findOne({ where: { code: 'DOCTOR' }, attributes: ['id'] })

  const userLocations = await UserLocation.findAll({
    where: {
      locId: locationId,
      jobCategoryId: { [Op.in]: jobCatIds },
      ...(doctorRole ? { roleId: doctorRole.id } : {}),
      isDeleted: false,
    },
    attributes: ['userId'],
  })

  return new Set(userLocations.map((ul) => ul.userId).filter(Boolean) as string[])
}

const loadShiftDateContext = async (
  locationId: string,
  shiftEmployeeDateId: string,
): Promise<ShiftDateWithAssignment | null> => {
  return (await ShiftDate.findOne({
    where: { id: shiftEmployeeDateId, locationId, isDeleted: false },
    include: [
      {
        model: ShiftAssignment,
        as: 'shiftAssignment',
        where: { isDeleted: false },
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
            attributes: ['id', 'name', 'startTime', 'endTime', 'numberOfSlots', 'slotDuration', 'slotGenerationMode'],
          },
        ],
      },
    ],
  })) as ShiftDateWithAssignment | null
}

const buildSlotsForShiftDate = (shiftDate: ShiftDateWithAssignment): string[] => {
  const assignment = shiftDate.shiftAssignment
  const shift = assignment?.shift
  if (!assignment || !shift) return []
  const window = resolveEffectiveWindow(assignment.slotTimeRange, shift.startTime, shift.endTime)
  if (!window) return []
  return generateAppointmentSlots(window.startTime, window.endTime, shift.numberOfSlots, shift.slotDuration)
}

const formatSpecializationLabel = (specializations: DoctorSpecializationSummary[] = []): string | null => {
  if (specializations.length === 0) return null
  const ordered = [...specializations].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  const names = ordered.map((s) => s.name).filter(Boolean)
  return names.length > 0 ? names.join(', ') : null
}

const formatDoctor = (
  employee?: AssignmentWithRelations['employee'],
  specializations: DoctorSpecializationSummary[] = [],
) => {
  if (!employee) return null
  const profile = employee.profile
  const firstName = profile?.firstName || ''
  const lastName = profile?.lastName || ''
  return {
    id: employee.id,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim() || employee.email || employee.username || 'Doctor',
    email: employee.email,
    specialization: formatSpecializationLabel(specializations),
    specializations,
  }
}

/**
 * GET /medical/appointments
 * Upcoming visiting-doctor shift days for the resident's location.
 */
export async function listVisitingDoctorAppointments(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ctx = await resolveResidentContext(req)
    if (!ctx) {
      res.status(401).json({ success: false, message: 'Unable to resolve resident context' })
      return
    }

    const visitingIds = await getVisitingDoctorIds(ctx.locationId)
    if (visitingIds.size === 0) {
      res.status(200).json({ success: true, message: 'No visiting doctor shifts', data: { appointments: [] } })
      return
    }

    const today = todayYmdLocal()
    const horizon = new Date()
    horizon.setDate(horizon.getDate() + 45)
    const horizonStr = todayYmdLocal(horizon)

    // Ensure shift_dates exist for upcoming visiting-doctor assignments
    const assignments = (await ShiftAssignment.findAll({
      where: {
        locationId: ctx.locationId,
        employeeId: { [Op.in]: [...visitingIds] },
        isDeleted: false,
        endDate: { [Op.gte]: today },
        startDate: { [Op.lte]: horizonStr },
      },
      include: [
        {
          model: Shift,
          as: 'shift',
          attributes: ['id', 'name', 'startTime', 'endTime', 'numberOfSlots', 'slotDuration'],
        },
      ],
    })) as AssignmentWithRelations[]

    const weekDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
    for (const assignment of assignments) {
      const rangeStart = assignment.startDate > today ? assignment.startDate : today
      const rangeEnd = assignment.endDate < horizonStr ? assignment.endDate : horizonStr
      if (rangeStart > rangeEnd) continue

      const cur = new Date(`${rangeStart}T00:00:00`)
      const last = new Date(`${rangeEnd}T00:00:00`)

      for (let d = new Date(cur); d <= last; d.setDate(d.getDate() + 1)) {
        if (assignment.workingDays && assignment.workingDays.length > 0) {
          const dayName = weekDays[d.getDay()]
          if (!dayName || !assignment.workingDays.includes(dayName)) continue
        }
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        const dateStr = `${y}-${m}-${day}`

        const existing = await ShiftDate.findOne({
          where: {
            employeeShiftAssignmentId: assignment.id,
            date: dateStr,
            locationId: ctx.locationId,
            isDeleted: false,
          },
        })
        if (!existing) {
          await ShiftDate.create({
            employeeShiftAssignmentId: assignment.id,
            date: dateStr,
            locationId: ctx.locationId,
            areaId: assignment.areaId,
            status: ShiftEmployeeDateStatus.UPCOMING,
          })
        }
      }
    }

    const shiftDates = (await ShiftDate.findAll({
      where: {
        locationId: ctx.locationId,
        isDeleted: false,
        date: { [Op.between]: [today, horizonStr] },
        status: { [Op.notIn]: [ShiftEmployeeDateStatus.DAY_OFF, ShiftEmployeeDateStatus.ABSENT] },
      },
      include: [
        {
          model: ShiftAssignment,
          as: 'shiftAssignment',
          where: {
            isDeleted: false,
            employeeId: { [Op.in]: [...visitingIds] },
          },
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
              attributes: ['id', 'name', 'startTime', 'endTime', 'numberOfSlots', 'slotDuration'],
            },
          ],
        },
      ],
      order: [['date', 'ASC']],
    })) as ShiftDateWithAssignment[]

    const doctorIds = [
      ...new Set(
        shiftDates
          .map((sd) => sd.shiftAssignment?.employeeId || sd.shiftAssignment?.employee?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    ]
    const specializationsByUser = await getSpecializationsForUsers(doctorIds)

    const appointments = []
    for (const sd of shiftDates) {
      const slots = buildSlotsForShiftDate(sd)
      const activeBookings = await DoctorAppointment.findAll({
        where: {
          shiftEmployeeDateId: sd.id,
          locationId: ctx.locationId,
          isDeleted: false,
          status: { [Op.in]: ACTIVE_BOOKING_STATUSES },
        },
        attributes: ['slotTimeRange'],
      })
      const bookedRanges = new Set(activeBookings.map((b) => b.slotTimeRange))
      const availableSlots = slots.filter((slot) => !bookedRanges.has(slot) && !isSlotInPast(sd.date, slot)).length
      const booked = bookedRanges.size
      const employeeId = sd.shiftAssignment?.employeeId || sd.shiftAssignment?.employee?.id
      const doctor = formatDoctor(
        sd.shiftAssignment?.employee,
        employeeId ? specializationsByUser[employeeId] || [] : [],
      )
      const shift = sd.shiftAssignment?.shift
      const effectiveTime =
        sd.shiftAssignment?.slotTimeRange || (shift ? `${shift.startTime} - ${shift.endTime}` : null)

      appointments.push({
        shiftEmployeeDateId: sd.id,
        date: sd.date,
        status: sd.status,
        doctor,
        shift: shift
          ? {
              id: shift.id,
              name: shift.name,
              startTime: shift.startTime,
              endTime: shift.endTime,
            }
          : null,
        effectiveTime,
        totalSlots: slots.length,
        availableSlots,
        bookedSlots: booked,
        isFullyBooked: slots.length > 0 && availableSlots <= 0,
      })
    }

    res.status(200).json({
      success: true,
      message: 'Visiting doctor appointments retrieved successfully',
      data: { appointments },
    })
  } catch (err) {
    console.error('List Visiting Doctor Appointments Error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch appointments' })
  }
}

/**
 * GET /medical/appointments/my-bookings
 */
export async function listMyAppointmentBookings(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ctx = await resolveResidentContext(req)
    if (!ctx) {
      res.status(401).json({ success: false, message: 'Unable to resolve resident context' })
      return
    }

    const rows = await DoctorAppointment.findAll({
      where: {
        locationId: ctx.locationId,
        residentId: ctx.residentId,
        isDeleted: false,
        status: { [Op.ne]: AppointmentStatus.CANCELLED },
      },
      include: [
        {
          model: ResidentFamilyMember,
          as: 'familyMember',
          attributes: ['id', 'firstName', 'lastName', 'relation', 'photoUrl'],
          required: false,
        },
        {
          model: User,
          as: 'doctor',
          attributes: ['id', 'email', 'username'],
          include: [{ model: UserDetail, as: 'profile', attributes: ['firstName', 'lastName'] }],
        },
        {
          model: ShiftDate,
          as: 'shiftEmployeeDate',
          attributes: ['id', 'date', 'status'],
          include: [
            {
              model: ShiftAssignment,
              as: 'shiftAssignment',
              include: [{ model: Shift, as: 'shift', attributes: ['id', 'name', 'startTime', 'endTime'] }],
            },
          ],
        },
      ],
      order: [
        ['appointmentDate', 'DESC'],
        ['bookedAt', 'DESC'],
      ],
    })

    const bookings = rows.map((row) => {
      const data = row.toJSON() as DoctorAppointment & {
        familyMember?: ResidentFamilyMember
        doctor?: User & { profile?: UserDetail }
        shiftEmployeeDate?: ShiftDateWithAssignment
      }
      const doctorProfile = data.doctor?.profile
      const doctorName = doctorProfile
        ? `${doctorProfile.firstName || ''} ${doctorProfile.lastName || ''}`.trim()
        : data.doctor?.email || 'Doctor'
      const fm = data.familyMember
      const memberName = fm ? `${fm.firstName || ''} ${fm.lastName || ''}`.trim() : 'Self'

      return {
        id: data.id,
        shiftEmployeeDateId: data.shiftEmployeeDateId,
        appointmentDate: data.appointmentDate,
        slotTimeRange: data.slotTimeRange,
        status: data.status,
        bookedAt: data.bookedAt,
        notes: data.notes,
        familyMemberId: data.familyMemberId,
        memberName,
        memberRelation: fm?.relation || 'Self',
        doctorName,
        shiftName: data.shiftEmployeeDate?.shiftAssignment?.shift?.name || 'Shift',
      }
    })

    res.status(200).json({
      success: true,
      message: 'My appointment bookings retrieved successfully',
      data: { bookings },
    })
  } catch (err) {
    console.error('List My Appointment Bookings Error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch my bookings' })
  }
}

/**
 * GET /medical/appointments/:shiftEmployeeDateId
 */
export async function getVisitingDoctorAppointmentDetail(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const ctx = await resolveResidentContext(req)
    if (!ctx) {
      res.status(401).json({ success: false, message: 'Unable to resolve resident context' })
      return
    }

    const shiftEmployeeDateId = asParamString(req.params.shiftEmployeeDateId)
    const shiftDate = await loadShiftDateContext(ctx.locationId, shiftEmployeeDateId)
    if (!shiftDate) {
      res.status(404).json({ success: false, message: 'Doctor shift not found' })
      return
    }

    const visitingIds = await getVisitingDoctorIds(ctx.locationId)
    const employeeId = shiftDate.shiftAssignment?.employeeId
    if (!employeeId || !visitingIds.has(employeeId)) {
      res.status(404).json({ success: false, message: 'Visiting doctor shift not found' })
      return
    }

    if (shiftDate.status === ShiftEmployeeDateStatus.DAY_OFF || shiftDate.status === ShiftEmployeeDateStatus.ABSENT) {
      res.status(400).json({ success: false, message: 'This shift is not available for booking' })
      return
    }

    const slots = buildSlotsForShiftDate(shiftDate)
    const activeBookings = await DoctorAppointment.findAll({
      where: {
        shiftEmployeeDateId,
        locationId: ctx.locationId,
        isDeleted: false,
        status: { [Op.in]: ACTIVE_BOOKING_STATUSES },
      },
      attributes: ['id', 'slotTimeRange', 'residentId', 'familyMemberId', 'status'],
    })

    const bookedRanges = new Set(activeBookings.map((b) => b.slotTimeRange))
    const myBookings = activeBookings.filter((b) => {
      if (b.residentId !== ctx.residentId) return false
      if (ctx.isFamilyMember) return b.familyMemberId === ctx.familyMemberId
      return !b.familyMemberId
    })

    const doctorSpecs = employeeId ? await getDoctorSpecializations(employeeId) : []
    const doctor = formatDoctor(shiftDate.shiftAssignment?.employee, doctorSpecs)
    const shift = shiftDate.shiftAssignment?.shift
    const totalSlots = slots.length
    const bookedSlots = bookedRanges.size
    const slotDetails = slots.map((slot) => {
      const isBooked = bookedRanges.has(slot)
      const isPast = isSlotInPast(shiftDate.date, slot)
      return {
        slotTimeRange: slot,
        isBooked,
        isPast,
        isAvailable: !isBooked && !isPast,
      }
    })
    const availableSlots = slotDetails.filter((s) => s.isAvailable).length

    res.status(200).json({
      success: true,
      message: 'Appointment detail retrieved successfully',
      data: {
        shiftEmployeeDateId: shiftDate.id,
        date: shiftDate.date,
        status: shiftDate.status,
        doctor,
        shift: shift
          ? {
              id: shift.id,
              name: shift.name,
              startTime: shift.startTime,
              endTime: shift.endTime,
              numberOfSlots: shift.numberOfSlots,
              slotDuration: shift.slotDuration,
            }
          : null,
        effectiveTime:
          shiftDate.shiftAssignment?.slotTimeRange || (shift ? `${shift.startTime} - ${shift.endTime}` : null),
        capacity: {
          totalSlots,
          availableSlots,
          bookedSlots,
          isFullyBooked: availableSlots <= 0 && totalSlots > 0,
        },
        slots: slotDetails,
        myBookings: myBookings.map((b) => ({
          id: b.id,
          slotTimeRange: b.slotTimeRange,
          familyMemberId: b.familyMemberId,
          status: b.status,
        })),
      },
    })
  } catch (err) {
    console.error('Get Visiting Doctor Appointment Detail Error:', err)
    res.status(500).json({ success: false, message: 'Failed to fetch appointment detail' })
  }
}

/**
 * POST /medical/appointments/:shiftEmployeeDateId/book
 * Body: { slotTimeRange, notes? }
 * Books for the logged-in user: primary resident (familyMemberId null) or family member from their login.
 */
export async function bookVisitingDoctorAppointment(req: AuthenticatedRequest, res: Response): Promise<void> {
  const transaction = await sequelize.transaction()
  try {
    const ctx = await resolveResidentContext(req)
    if (!ctx) {
      await transaction.rollback()
      res.status(401).json({ success: false, message: 'Unable to resolve resident context' })
      return
    }

    const shiftEmployeeDateId = asParamString(req.params.shiftEmployeeDateId)
    const { slotTimeRange, notes } = req.body

    if (!slotTimeRange || typeof slotTimeRange !== 'string' || !slotTimeRange.trim()) {
      await transaction.rollback()
      res.status(400).json({ success: false, message: 'Please select an available slot' })
      return
    }

    // Book for authenticated user only — family members book from their own login
    const familyMemberId: string | null = ctx.isFamilyMember && ctx.familyMemberId ? ctx.familyMemberId : null

    const shiftDate = await loadShiftDateContext(ctx.locationId, shiftEmployeeDateId)
    if (!shiftDate) {
      await transaction.rollback()
      res.status(404).json({ success: false, message: 'Doctor shift not found' })
      return
    }

    const visitingIds = await getVisitingDoctorIds(ctx.locationId)
    const employeeId = shiftDate.shiftAssignment?.employeeId
    if (!employeeId || !visitingIds.has(employeeId)) {
      await transaction.rollback()
      res.status(404).json({ success: false, message: 'Visiting doctor shift not found' })
      return
    }

    if (shiftDate.status === ShiftEmployeeDateStatus.DAY_OFF || shiftDate.status === ShiftEmployeeDateStatus.ABSENT) {
      await transaction.rollback()
      res.status(400).json({ success: false, message: 'Cannot book appointments on day off or absent shifts' })
      return
    }

    const slots = buildSlotsForShiftDate(shiftDate)
    const normalizedSlot = String(slotTimeRange).trim()
    if (!slots.includes(normalizedSlot)) {
      await transaction.rollback()
      res.status(400).json({ success: false, message: 'Invalid slot for this doctor shift' })
      return
    }
    if (isSlotInPast(shiftDate.date, normalizedSlot)) {
      await transaction.rollback()
      res.status(400).json({ success: false, message: 'Cannot book a past time slot' })
      return
    }

    if (familyMemberId) {
      const familyMember = await ResidentFamilyMember.findOne({
        where: { id: familyMemberId, residentId: ctx.residentId, isDeleted: false },
        transaction,
      })
      if (!familyMember) {
        await transaction.rollback()
        res.status(400).json({ success: false, message: 'Family member not found for this flat' })
        return
      }
    }

    const doctorId = shiftDate.shiftAssignment?.employeeId
    if (!doctorId) {
      await transaction.rollback()
      res.status(400).json({ success: false, message: 'Doctor not found on this shift' })
      return
    }

    const existingSlot = await DoctorAppointment.findOne({
      where: {
        shiftEmployeeDateId,
        locationId: ctx.locationId,
        slotTimeRange: normalizedSlot,
        isDeleted: false,
        status: { [Op.in]: ACTIVE_BOOKING_STATUSES },
      },
      transaction,
    })
    if (existingSlot) {
      await transaction.rollback()
      res.status(409).json({ success: false, message: 'This slot is already booked' })
      return
    }

    const personWhere: Record<string, unknown> = {
      shiftEmployeeDateId,
      locationId: ctx.locationId,
      residentId: ctx.residentId,
      isDeleted: false,
      status: { [Op.ne]: AppointmentStatus.CANCELLED },
    }
    if (familyMemberId) {
      personWhere.familyMemberId = familyMemberId
    } else {
      personWhere.familyMemberId = { [Op.is]: null }
    }

    const existingPerson = await DoctorAppointment.findOne({ where: personWhere, transaction })
    if (existingPerson) {
      await transaction.rollback()
      res.status(409).json({ success: false, message: 'You already have an appointment on this doctor shift' })
      return
    }

    const appointment = await DoctorAppointment.create(
      {
        locationId: ctx.locationId,
        shiftEmployeeDateId,
        residentId: ctx.residentId,
        familyMemberId,
        doctorId,
        appointmentDate: shiftDate.date,
        slotTimeRange: normalizedSlot,
        status: AppointmentStatus.CONFIRMED,
        bookedAt: new Date(),
        notes: notes || null,
        createdBy: req.user?.id || null,
        updatedBy: req.user?.id || null,
      },
      { transaction },
    )

    await transaction.commit()

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully',
      data: {
        appointment: {
          id: appointment.id,
          shiftEmployeeDateId: appointment.shiftEmployeeDateId,
          residentId: appointment.residentId,
          familyMemberId: appointment.familyMemberId,
          doctorId: appointment.doctorId,
          appointmentDate: appointment.appointmentDate,
          slotTimeRange: appointment.slotTimeRange,
          status: appointment.status,
          bookedAt: appointment.bookedAt,
          notes: appointment.notes,
        },
      },
    })
  } catch (err) {
    await transaction.rollback()
    console.error('Book Visiting Doctor Appointment Error:', err)
    res.status(500).json({ success: false, message: 'Failed to book appointment' })
  }
}
