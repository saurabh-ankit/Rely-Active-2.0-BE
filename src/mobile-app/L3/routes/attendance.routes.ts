import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import {
  getAllProperties,
  getGlobalMealSlots,
  getPropertyMealSlots,
  getResidingMembersAndFlats,
  markAttendanceAndCreateOrder,
  markGuestAttendance,
} from '../controllers/fnbEmployee.controller.js'
import {
  getEventRegistrations,
  getEventWalkIns,
  getTodayEvents,
  markEventAttendance,
  markReservationPerson,
  undoReservationPerson,
  markWalkInAttendance,
  requireAttendanceStaff,
  undoWalkInAttendance,
} from '../controllers/attendanceStaff.controller.js'

/** Attendance staff (Attendance department): residents' dine-in and event attendance. */
const router = Router()

router.use(authenticate, requireAttendanceStaff)

// Dine-in (food) attendance
router.get('/property', getAllProperties)
router.get('/meal-slots', getPropertyMealSlots)
router.get('/meal-slots/global', getGlobalMealSlots)
router.get('/dine-in/members', getResidingMembersAndFlats)
router.post('/dine-in/mark', markAttendanceAndCreateOrder)
router.post('/dine-in/guest', markGuestAttendance)

// Event attendance (regular and special events; not resident-request events). With reservations: registered residents.
// Without reservations (open to all): any residing resident who comes.
router.get('/events', getTodayEvents)
router.get('/events/:eventId/registrations', getEventRegistrations)
router.patch('/events/:eventId/registrations/:registrationId', markEventAttendance)
router.put('/events/:eventId/registrations/:registrationId/people', markReservationPerson)
router.delete('/events/:eventId/registrations/:registrationId/people', undoReservationPerson)
router.get('/events/:eventId/walk-ins', getEventWalkIns)
router.put('/events/:eventId/walk-ins/:residentId', markWalkInAttendance)
router.delete('/events/:eventId/walk-ins/:residentId', undoWalkInAttendance)

export default router
