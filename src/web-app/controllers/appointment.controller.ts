import { Op } from 'sequelize'
import type { Response } from 'express'
import { AppointmentStatus } from '../../enums/appointment.enum.js'
import { ShiftEmployeeDateStatus } from '../../enums/roster.enum.js'
import { AuthenticatedRequest } from '../../middlewares/authenticate.js'
import {
  DoctorAppointment,
  Resident,
  ResidentFamilyMember,
  Shift,
  ShiftAssignment,
  ShiftDate,
  User,
  UserDetail,
} from '../../models/index.js'
import { generateAppointmentSlots, isSlotInPast, resolveEffectiveWindow } from '../../utils/appointment.util.js'
import { asParamString } from '../../utils/roster.util.js'
import { errorResponse, successResponse } from '../../utils/response/index.js'
import sequelize from '../../config/db/index.js'

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

const formatResident = (resident: Resident) => {
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

const formatFamilyMember = (fm: ResidentFamilyMember) => {
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

const formatPatientDisplay = (resident?: Resident | null, familyMember?: ResidentFamilyMember | null) => {
  if (familyMember) {
    const fm = formatFamilyMember(familyMember)
    return {
      ...fm,
      isFamilyMember: true,
      displayLabel: `${fm.fullName}${fm.relation ? ` · ${fm.relation}` : ''}`,
    }
  }
  if (resident) {
    const r = formatResident(resident)
    return {
      ...r,
      isFamilyMember: false,
      displayLabel: `${r.fullName} (Self)`,
    }
  }
  return null
}

const formatDoctor = (employee?: AssignmentWithRelations['employee']) => {
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
    username: employee.username,
  }
}

/** GET /shift-dates/:shiftEmployeeDateId */
export const getAppointmentShiftDate = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    const shiftEmployeeDateId = asParamString(req.params.shiftEmployeeDateId)

    const shiftDate = await loadShiftDateContext(locationId, shiftEmployeeDateId)
    if (!shiftDate) {
      return res.status(404).json(errorResponse('Doctor shift date not found'))
    }

    const assignment = shiftDate.shiftAssignment
    const doctor = formatDoctor(assignment?.employee)
    const slots = buildSlotsForShiftDate(shiftDate)

    return res.status(200).json(
      successResponse('Doctor shift date retrieved successfully', {
        shiftEmployeeDateId: shiftDate.id,
        date: shiftDate.date,
        status: shiftDate.status,
        doctor,
        doctorId: assignment?.employeeId || doctor?.id,
        shift: assignment?.shift
          ? {
              id: assignment.shift.id,
              name: assignment.shift.name,
              startTime: assignment.shift.startTime,
              endTime: assignment.shift.endTime,
              numberOfSlots: assignment.shift.numberOfSlots,
              slotDuration: assignment.shift.slotDuration,
            }
          : null,
        assignmentId: assignment?.id,
        slotTimeRange: assignment?.slotTimeRange || null,
        effectiveTime:
          assignment?.slotTimeRange ||
          (assignment?.shift ? `${assignment.shift.startTime} - ${assignment.shift.endTime}` : null),
        totalSlots: slots.length,
        slots,
      }),
    )
  } catch (err) {
    console.error('Get Appointment Shift Date Error:', err)
    return res.status(500).json(errorResponse('Failed to fetch doctor shift date'))
  }
}

/** GET /shift-dates/:shiftEmployeeDateId/capacity */
export const getAppointmentCapacity = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    const shiftEmployeeDateId = asParamString(req.params.shiftEmployeeDateId)

    const shiftDate = await loadShiftDateContext(locationId, shiftEmployeeDateId)
    if (!shiftDate) {
      return res.status(404).json(errorResponse('Doctor shift date not found'))
    }

    const slots = buildSlotsForShiftDate(shiftDate)
    const baseWhere = { shiftEmployeeDateId, locationId, isDeleted: false }

    const [
      totalBookings,
      confirmedBookings,
      pendingBookings,
      cancelledBookings,
      attendedBookings,
      noShowBookings,
      activeBookings,
    ] = await Promise.all([
      DoctorAppointment.count({ where: baseWhere }),
      DoctorAppointment.count({ where: { ...baseWhere, status: AppointmentStatus.CONFIRMED } }),
      DoctorAppointment.count({ where: { ...baseWhere, status: AppointmentStatus.PENDING } }),
      DoctorAppointment.count({ where: { ...baseWhere, status: AppointmentStatus.CANCELLED } }),
      DoctorAppointment.count({ where: { ...baseWhere, status: AppointmentStatus.ATTENDED } }),
      DoctorAppointment.count({ where: { ...baseWhere, status: AppointmentStatus.NO_SHOW } }),
      DoctorAppointment.findAll({
        where: { ...baseWhere, status: { [Op.in]: ACTIVE_BOOKING_STATUSES } },
        attributes: ['id', 'slotTimeRange', 'status', 'residentId'],
      }),
    ])

    const bookedSlotRanges = new Set(activeBookings.map((b) => b.slotTimeRange))
    const totalSlots = slots.length
    const bookedSlots = bookedSlotRanges.size
    const slotDetails = slots.map((slot) => {
      const isBooked = bookedSlotRanges.has(slot)
      const isPast = isSlotInPast(shiftDate.date, slot)
      return {
        slotTimeRange: slot,
        isBooked,
        isPast,
        isAvailable: !isBooked && !isPast,
      }
    })
    const availableSlots = slotDetails.filter((s) => s.isAvailable).length
    const utilizationPercentage = totalSlots > 0 ? (bookedSlots / totalSlots) * 100 : 0

    const doctor = formatDoctor(shiftDate.shiftAssignment?.employee)
    const shiftName = shiftDate.shiftAssignment?.shift?.name || 'Shift'

    return res.status(200).json(
      successResponse('Appointment capacity retrieved successfully', {
        shiftEmployeeDateId: shiftDate.id,
        date: shiftDate.date,
        doctorName: doctor?.fullName,
        shiftName,
        totalSlots,
        availableSlots,
        bookedSlots,
        activeBookings: bookedSlots,
        utilizationPercentage: Math.round(utilizationPercentage * 100) / 100,
        isFullyBooked: availableSlots <= 0 && totalSlots > 0,
        totalBookings,
        confirmedBookings,
        pendingBookings,
        cancelledBookings,
        attendedBookings,
        noShowBookings,
        // aliases matching Event Registrations UI naming
        totalCapacity: totalSlots,
        availableSpots: availableSlots,
        activeSeats: bookedSlots,
        confirmedRegistrations: confirmedBookings,
        pendingRegistrations: pendingBookings,
        cancelledRegistrations: cancelledBookings,
        attendedRegistrations: attendedBookings,
        noShowRegistrations: noShowBookings,
        slots: slotDetails,
      }),
    )
  } catch (err) {
    console.error('Get Appointment Capacity Error:', err)
    return res.status(500).json(errorResponse('Failed to fetch appointment capacity'))
  }
}

/** GET /shift-dates/:shiftEmployeeDateId/bookings */
export const getAppointmentBookings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const locationId = asParamString(req.params.locationId)
    const shiftEmployeeDateId = asParamString(req.params.shiftEmployeeDateId)
    const { status, search, page = 1, limit = 20 } = req.query

    const shiftDate = await loadShiftDateContext(locationId, shiftEmployeeDateId)
    if (!shiftDate) {
      return res.status(404).json(errorResponse('Doctor shift date not found'))
    }

    const offset = (parseInt(String(page)) - 1) * parseInt(String(limit))
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
      limit: parseInt(String(limit)),
      offset,
    })

    // Client-side search filter across resident + family member when provided
    let filteredRows = rows
    if (search) {
      const q = String(search).toLowerCase()
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
    const shiftName = shiftDate.shiftAssignment?.shift?.name || 'Shift'

    const bookings = filteredRows.map((row) => {
      const data = row.toJSON() as DoctorAppointment & {
        resident?: Resident
        familyMember?: ResidentFamilyMember
      }
      const resident = data.resident ? formatResident(data.resident as Resident) : null
      const familyMember = data.familyMember ? formatFamilyMember(data.familyMember as ResidentFamilyMember) : null
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

    return res.status(200).json(
      successResponse('Appointment bookings retrieved successfully', {
        bookings,
        pagination: {
          currentPage: parseInt(String(page)),
          totalPages: Math.ceil(totalCount / parseInt(String(limit))),
          totalCount,
          limit: parseInt(String(limit)),
          hasNextPage: offset + parseInt(String(limit)) < totalCount,
          hasPrevPage: parseInt(String(page)) > 1,
          nextPage: offset + parseInt(String(limit)) < totalCount ? parseInt(String(page)) + 1 : null,
          prevPage: parseInt(String(page)) > 1 ? parseInt(String(page)) - 1 : null,
        },
      }),
    )
  } catch (err) {
    console.error('Get Appointment Bookings Error:', err)
    return res.status(500).json(errorResponse('Failed to fetch appointment bookings'))
  }
}

/** POST /shift-dates/:shiftEmployeeDateId/bookings */
export const bookAppointment = async (req: AuthenticatedRequest, res: Response) => {
  const transaction = await sequelize.transaction()
  try {
    const locationId = asParamString(req.params.locationId)
    const shiftEmployeeDateId = asParamString(req.params.shiftEmployeeDateId)
    const { residentId, familyMemberId, slotTimeRange, notes } = req.body
    const createdBy = req.user?.id

    if (!createdBy) {
      await transaction.rollback()
      return res.status(401).json(errorResponse('User not authenticated'))
    }
    if (!residentId || !slotTimeRange) {
      await transaction.rollback()
      return res.status(400).json(errorResponse('residentId and slotTimeRange are required'))
    }

    const shiftDate = await loadShiftDateContext(locationId, shiftEmployeeDateId)
    if (!shiftDate) {
      await transaction.rollback()
      return res.status(404).json(errorResponse('Doctor shift date not found'))
    }

    if (shiftDate.status === 'day_off' || shiftDate.status === 'absent') {
      await transaction.rollback()
      return res.status(400).json(errorResponse('Cannot book appointments on day off or absent shifts'))
    }

    const slots = buildSlotsForShiftDate(shiftDate)
    const normalizedSlot = String(slotTimeRange).trim()
    if (!slots.includes(normalizedSlot)) {
      await transaction.rollback()
      return res.status(400).json(errorResponse('Invalid slot for this doctor shift'))
    }
    if (isSlotInPast(shiftDate.date, normalizedSlot)) {
      await transaction.rollback()
      return res.status(400).json(errorResponse('Cannot book a past time slot'))
    }

    const resident = await Resident.findOne({
      where: { id: residentId, isDeleted: false },
      transaction,
    })
    if (!resident) {
      await transaction.rollback()
      return res.status(404).json(errorResponse('Resident not found'))
    }

    const resolvedFamilyMemberId: string | null = familyMemberId || null
    if (resolvedFamilyMemberId) {
      const familyMember = await ResidentFamilyMember.findOne({
        where: {
          id: resolvedFamilyMemberId,
          residentId,
          isDeleted: false,
        },
        transaction,
      })
      if (!familyMember) {
        await transaction.rollback()
        return res.status(400).json(errorResponse('Family member not found for this resident'))
      }
    }

    const doctorId = shiftDate.shiftAssignment?.employeeId
    if (!doctorId) {
      await transaction.rollback()
      return res.status(400).json(errorResponse('Doctor not found on this shift'))
    }

    const existingSlot = await DoctorAppointment.findOne({
      where: {
        shiftEmployeeDateId,
        locationId,
        slotTimeRange: String(slotTimeRange).trim(),
        isDeleted: false,
        status: { [Op.in]: ACTIVE_BOOKING_STATUSES },
      },
      transaction,
    })
    if (existingSlot) {
      await transaction.rollback()
      return res.status(409).json(errorResponse('This slot is already booked'))
    }

    const personWhere: Record<string, unknown> = {
      shiftEmployeeDateId,
      locationId,
      residentId,
      isDeleted: false,
      status: { [Op.ne]: AppointmentStatus.CANCELLED },
    }
    if (resolvedFamilyMemberId) {
      personWhere.familyMemberId = resolvedFamilyMemberId
    } else {
      personWhere.familyMemberId = { [Op.is]: null }
    }

    const existingPerson = await DoctorAppointment.findOne({
      where: personWhere,
      transaction,
    })
    if (existingPerson) {
      await transaction.rollback()
      return res.status(409).json(errorResponse('This member already has an appointment on this doctor shift'))
    }

    const appointment = await DoctorAppointment.create(
      {
        locationId,
        shiftEmployeeDateId,
        residentId,
        familyMemberId: resolvedFamilyMemberId,
        doctorId,
        appointmentDate: shiftDate.date,
        slotTimeRange: String(slotTimeRange).trim(),
        status: AppointmentStatus.CONFIRMED,
        bookedAt: new Date(),
        notes: notes || null,
        createdBy,
        updatedBy: createdBy,
      },
      { transaction },
    )

    await transaction.commit()

    return res.status(201).json(
      successResponse('Appointment booked successfully', {
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
      }),
    )
  } catch (err) {
    await transaction.rollback()
    console.error('Book Appointment Error:', err)
    return res.status(500).json(errorResponse('Failed to book appointment'))
  }
}

/** PUT /bookings/:appointmentId/status */
export const updateAppointmentStatus = async (req: AuthenticatedRequest, res: Response) => {
  const transaction = await sequelize.transaction()
  try {
    const locationId = asParamString(req.params.locationId)
    const appointmentId = asParamString(req.params.appointmentId)
    const { status, notes } = req.body
    const updatedBy = req.user?.id

    if (!updatedBy) {
      await transaction.rollback()
      return res.status(401).json(errorResponse('User not authenticated'))
    }

    const validStatuses = [AppointmentStatus.ATTENDED, AppointmentStatus.NO_SHOW, AppointmentStatus.CANCELLED]
    if (!status || !validStatuses.includes(status)) {
      await transaction.rollback()
      return res.status(400).json(errorResponse(`Invalid status. Must be one of: ${validStatuses.join(', ')}`))
    }

    const appointment = await DoctorAppointment.findOne({
      where: { id: appointmentId, locationId, isDeleted: false },
      include: [
        {
          model: Resident,
          as: 'resident',
          attributes: ['id', 'firstName', 'lastName', 'username', 'email', 'phone', 'photoUrl'],
        },
      ],
      transaction,
    })

    if (!appointment) {
      await transaction.rollback()
      return res.status(404).json(errorResponse('Appointment not found'))
    }

    const previousStatus = appointment.status
    const updateData: Record<string, unknown> = { status, updatedBy }

    if (status === AppointmentStatus.ATTENDED) {
      updateData.attendedAt = new Date()
      updateData.cancelledAt = null
      updateData.cancellationReason = null
    } else if (status === AppointmentStatus.NO_SHOW) {
      updateData.attendedAt = null
    } else if (status === AppointmentStatus.CANCELLED) {
      updateData.cancelledAt = new Date()
      updateData.cancellationReason = notes || 'Cancelled by admin'
      updateData.attendedAt = null
    }

    if (notes !== undefined) updateData.notes = notes || null

    await DoctorAppointment.update(updateData, {
      where: { id: appointment.id },
      transaction,
    })

    await transaction.commit()

    const updated = await DoctorAppointment.findByPk(appointment.id, {
      include: [
        {
          model: Resident,
          as: 'resident',
          attributes: ['id', 'firstName', 'lastName', 'username', 'photoUrl', 'email', 'phone'],
        },
      ],
    })

    const data = updated?.toJSON() as (DoctorAppointment & { resident?: Resident }) | undefined
    const resident = data?.resident ? formatResident(data.resident as Resident) : null

    return res.status(200).json(
      successResponse('Appointment status updated successfully', {
        appointment: {
          id: data?.id,
          status: data?.status,
          previousStatus,
          slotTimeRange: data?.slotTimeRange,
          appointmentDate: data?.appointmentDate,
          attendedAt: data?.attendedAt,
          cancelledAt: data?.cancelledAt,
          cancellationReason: data?.cancellationReason,
          notes: data?.notes,
          resident,
          patient: resident,
        },
      }),
    )
  } catch (err) {
    await transaction.rollback()
    console.error('Update Appointment Status Error:', err)
    return res.status(500).json(errorResponse('Failed to update appointment status'))
  }
}

/**
 * POST /shift-dates/ensure
 * Find or create a shift_dates row for assignmentId + date (needed for calendar deep-links).
 */
export const ensureAppointmentShiftDate = async (req: AuthenticatedRequest, res: Response) => {
  const transaction = await sequelize.transaction()
  try {
    const locationId = asParamString(req.params.locationId)
    const { assignmentId, date } = req.body
    const createdBy = req.user?.id

    if (!assignmentId || !date) {
      await transaction.rollback()
      return res.status(400).json(errorResponse('assignmentId and date are required'))
    }

    const assignment = await ShiftAssignment.findOne({
      where: { id: assignmentId, locationId, isDeleted: false },
      transaction,
    })
    if (!assignment) {
      await transaction.rollback()
      return res.status(404).json(errorResponse('Shift assignment not found'))
    }

    let shiftDate = await ShiftDate.findOne({
      where: {
        employeeShiftAssignmentId: assignmentId,
        date,
        locationId,
        isDeleted: false,
      },
      transaction,
    })

    if (!shiftDate) {
      shiftDate = await ShiftDate.create(
        {
          employeeShiftAssignmentId: assignmentId,
          date,
          locationId,
          areaId: assignment.areaId,
          status: ShiftEmployeeDateStatus.UPCOMING,
          createdBy: createdBy || null,
          updatedBy: createdBy || null,
        },
        { transaction },
      )
    }

    await transaction.commit()

    return res.status(200).json(
      successResponse('Shift date ensured', {
        shiftEmployeeDateId: shiftDate.id,
        date: shiftDate.date,
        assignmentId,
      }),
    )
  } catch (err) {
    await transaction.rollback()
    console.error('Ensure Appointment Shift Date Error:', err)
    return res.status(500).json(errorResponse('Failed to ensure shift date'))
  }
}
