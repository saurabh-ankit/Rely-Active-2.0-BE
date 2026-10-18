import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import {
  cancelResidentAmenityBooking,
  createResidentAmenityBooking,
  getResidentAmenitySlotsByDate,
  listResidentAmenityBookings,
  listResidentAmenities,
} from '../controllers/amenityMobile.controller.js'

const amenityMobileRouter = Router()

amenityMobileRouter.use(authenticate)

amenityMobileRouter.get('/my-bookings', listResidentAmenityBookings)
amenityMobileRouter.get('/', listResidentAmenities)
amenityMobileRouter.get('/:amenityId/slots', getResidentAmenitySlotsByDate)
amenityMobileRouter.post('/:amenityId/bookings', createResidentAmenityBooking)
amenityMobileRouter.delete('/:amenityId/bookings/:bookingId', cancelResidentAmenityBooking)

export default amenityMobileRouter
