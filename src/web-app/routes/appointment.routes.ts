import { Router } from 'express'
import {
  bookAppointment,
  ensureAppointmentShiftDate,
  getAppointmentBookings,
  getAppointmentCapacity,
  getAppointmentShiftDate,
  updateAppointmentStatus,
} from '../controllers/appointment.controller.js'

/**
 * Doctor appointment booking routes (visiting-doctor shift day bookings).
 * Mounted at: /location/:locationId/medical/appointments
 */
const appointmentRouter = Router({ mergeParams: true })

appointmentRouter.post('/shift-dates/ensure', ensureAppointmentShiftDate)
appointmentRouter.get('/shift-dates/:shiftEmployeeDateId', getAppointmentShiftDate)
appointmentRouter.get('/shift-dates/:shiftEmployeeDateId/capacity', getAppointmentCapacity)
appointmentRouter.get('/shift-dates/:shiftEmployeeDateId/bookings', getAppointmentBookings)
appointmentRouter.post('/shift-dates/:shiftEmployeeDateId/bookings', bookAppointment)
appointmentRouter.put('/bookings/:appointmentId/status', updateAppointmentStatus)

export default appointmentRouter
