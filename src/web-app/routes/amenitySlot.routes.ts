import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { validateBody, validateParams, validateQuery } from '../../middlewares/validate/index.js'
import {
  amenitySlotBlockParamsSchema,
  amenitySlotBookingParamsSchema,
  amenitySlotParamsSchema,
  amenitySlotQuerySchema,
  createAmenitySlotBlockSchema,
  createAmenitySlotBookingSchema,
  updateAmenitySlotConfigSchema,
} from '../../validations/amenitySlot.validation.js'
import {
  blockAmenitySlot,
  cancelAmenitySlotBooking,
  createAmenitySlotBooking,
  getAmenitySlotConfig,
  getAmenitySlotsForDate,
  unblockAmenitySlot,
  updateAmenitySlotConfig,
} from '../controllers/amenitySlot.controller.js'

const router = Router({ mergeParams: true })

router.use(authenticate)

router.get('/:amenityId/slot-config', validateParams(amenitySlotParamsSchema), getAmenitySlotConfig)
router.put(
  '/:amenityId/slot-config',
  validateParams(amenitySlotParamsSchema),
  validateBody(updateAmenitySlotConfigSchema),
  updateAmenitySlotConfig,
)

router.get(
  '/:amenityId/slots',
  validateParams(amenitySlotParamsSchema),
  validateQuery(amenitySlotQuerySchema),
  getAmenitySlotsForDate,
)

router.post(
  '/:amenityId/bookings',
  validateParams(amenitySlotParamsSchema),
  validateBody(createAmenitySlotBookingSchema),
  createAmenitySlotBooking,
)

router.delete(
  '/:amenityId/bookings/:bookingId',
  validateParams(amenitySlotBookingParamsSchema),
  cancelAmenitySlotBooking,
)

router.post(
  '/:amenityId/blocks',
  validateParams(amenitySlotParamsSchema),
  validateBody(createAmenitySlotBlockSchema),
  blockAmenitySlot,
)

router.delete('/:amenityId/blocks/:blockId', validateParams(amenitySlotBlockParamsSchema), unblockAmenitySlot)

export default router
