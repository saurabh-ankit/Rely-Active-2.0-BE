import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import {
  bookVisitingDoctorAppointment,
  getInhouseShiftDiagnosis,
  getMyBookingDiagnosis,
  getVisitingDoctorAppointmentDetail,
  listInhouseDoctorAppointments,
  listMyAppointmentBookings,
  listVisitingDoctorAppointments,
} from '../controllers/appointmentMobile.controller.js'

const appointmentMobileRouter = Router()
appointmentMobileRouter.use(authenticate)

// Static paths before :shiftEmployeeDateId
appointmentMobileRouter.get('/my-bookings', listMyAppointmentBookings)
appointmentMobileRouter.get('/bookings/:appointmentId/diagnosis', getMyBookingDiagnosis)
appointmentMobileRouter.get('/inhouse', listInhouseDoctorAppointments)
appointmentMobileRouter.get('/inhouse/:shiftEmployeeDateId/diagnosis', getInhouseShiftDiagnosis)
appointmentMobileRouter.get('/', listVisitingDoctorAppointments)
appointmentMobileRouter.get('/:shiftEmployeeDateId', getVisitingDoctorAppointmentDetail)
appointmentMobileRouter.post('/:shiftEmployeeDateId/book', bookVisitingDoctorAppointment)

export default appointmentMobileRouter
