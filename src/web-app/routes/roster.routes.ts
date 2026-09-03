import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { validateBody } from '../../middlewares/validate/index.js'
import {
  createShiftSchema,
  createAssignmentSchema,
  requestReplacementSchema,
  cancelRosterDateSchema,
  copyAssignmentSchema,
  onboardDoctorSchema,
  bookOpdSlotSchema,
  cancelOpdBookingSchema,
} from '../../validations/roster.validation.js'
import {
  onboardDoctor,
  addDoctorLocationScope,
  createDoctorEngagement,
  getDoctorsForLocation,
} from '../controllers/rosters/doctor.controller.js'
import { createShiftTemplate, getShiftTemplates, updateShiftTemplate } from '../controllers/rosters/shift.controller.js'
import { createFrequencyTemplate, getFrequencyTemplates } from '../controllers/rosters/frequency.controller.js'
import {
  validateAssignment,
  createAssignment,
  getAssignments,
  publishAssignment,
  copyAssignment,
} from '../controllers/rosters/assignment.controller.js'
import {
  getRosterDates,
  requestShiftReplacement,
  cancelRosterDate,
} from '../controllers/rosters/dateInstance.controller.js'
import {
  getSchedulingResources,
  syncSchedulingResources,
} from '../controllers/rosters/schedulingResource.controller.js'
import { getOpdSlotsForDate, bookOpdSlot, cancelOpdBooking } from '../controllers/rosters/opdSlot.controller.js'
import {
  getSpecializations,
  createSpecialization,
  deleteSpecialization,
} from '../controllers/rosters/medicalSpecialization.controller.js'

const router = Router()

router.use(authenticate)

router.get('/specializations', getSpecializations)
router.post('/specializations', createSpecialization)
router.delete('/specializations/:id', deleteSpecialization)

router.post(
  '/companies/:companyId/locations/:locationId/doctors/onboard',
  validateBody(onboardDoctorSchema),
  onboardDoctor,
)
router.get('/companies/:companyId/locations/:locationId/doctors', getDoctorsForLocation)
router.post('/doctors/:doctorProfileId/locations', addDoctorLocationScope)
router.post('/doctors/:doctorProfileId/engagements', createDoctorEngagement)

router.get('/companies/:companyId/locations/:locationId/scheduling-resources', getSchedulingResources)
router.post('/companies/:companyId/locations/:locationId/scheduling-resources/sync', syncSchedulingResources)

router.post('/companies/:companyId/locations/:locationId/shifts', validateBody(createShiftSchema), createShiftTemplate)
router.get('/companies/:companyId/locations/:locationId/shifts', getShiftTemplates)
router.put(
  '/companies/:companyId/locations/:locationId/shifts/:shiftId',
  validateBody(createShiftSchema),
  updateShiftTemplate,
)

router.post('/companies/:companyId/locations/:locationId/frequencies', createFrequencyTemplate)
router.get('/companies/:companyId/locations/:locationId/frequencies', getFrequencyTemplates)

router.post('/companies/:companyId/locations/:locationId/assignments/validate', validateAssignment)
router.post(
  '/companies/:companyId/locations/:locationId/assignments',
  validateBody(createAssignmentSchema),
  createAssignment,
)
router.get('/companies/:companyId/locations/:locationId/assignments', getAssignments)
router.post('/companies/:companyId/locations/:locationId/assignments/:assignmentId/publish', publishAssignment)
router.post(
  '/companies/:companyId/locations/:locationId/assignments/:assignmentId/copy-forward',
  validateBody(copyAssignmentSchema),
  copyAssignment,
)

router.get('/companies/:companyId/locations/:locationId/roster-dates', getRosterDates)
router.get('/companies/:companyId/locations/:locationId/roster-dates/:dateId/opd-slots', getOpdSlotsForDate)
router.post(
  '/companies/:companyId/locations/:locationId/roster-dates/:dateId/replace',
  validateBody(requestReplacementSchema),
  requestShiftReplacement,
)
router.delete(
  '/companies/:companyId/locations/:locationId/roster-dates/:dateId',
  validateBody(cancelRosterDateSchema),
  cancelRosterDate,
)

router.post(
  '/companies/:companyId/locations/:locationId/opd-slots/:slotId/book',
  validateBody(bookOpdSlotSchema),
  bookOpdSlot,
)
router.delete(
  '/companies/:companyId/locations/:locationId/opd-bookings/:bookingId',
  validateBody(cancelOpdBookingSchema),
  cancelOpdBooking,
)

export default router
