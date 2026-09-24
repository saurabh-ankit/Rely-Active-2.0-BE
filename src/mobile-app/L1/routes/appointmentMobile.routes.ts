import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import {
  bookVisitingDoctorAppointment,
  getVisitingDoctorAppointmentDetail,
  listMyAppointmentBookings,
  listVisitingDoctorAppointments,
} from '../controllers/appointmentMobile.controller.js'

const appointmentMobileRouter = Router()
appointmentMobileRouter.use(authenticate)

// Static paths before :shiftEmployeeDateId
appointmentMobileRouter.get('/my-bookings', listMyAppointmentBookings)
appointmentMobileRouter.get('/', listVisitingDoctorAppointments)
appointmentMobileRouter.get('/:shiftEmployeeDateId', getVisitingDoctorAppointmentDetail)
appointmentMobileRouter.post('/:shiftEmployeeDateId/book', bookVisitingDoctorAppointment)

export default appointmentMobileRouter
