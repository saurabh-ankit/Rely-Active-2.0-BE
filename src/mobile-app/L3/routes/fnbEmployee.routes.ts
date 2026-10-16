import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import {
  getAssignedDeliveries,
  updateDeliveryStatus,
  completeDeliveryWithProof,
  getAllProperties,
  getPropertyMealSlots,
  getGlobalMealSlots,
  getResidingMembersAndFlats,
  markAttendanceAndCreateOrder,
  markGuestAttendance,
  getResidentOrdersForProperty,
  updateOrderStatus,
  completeRoomDelivery,
} from '../controllers/fnbEmployee.controller.js'
import { requireAttendanceStaff } from '../controllers/attendanceStaff.controller.js'

const router = Router()

// Require authentication for employee mobile app endpoints
router.use(authenticate)

// Property & Meal Slots
router.get('/property', getAllProperties)
router.get('/meal-slots', getPropertyMealSlots)
router.get('/meal-slots/global', getGlobalMealSlots)

// Attendance is marked by Attendance department staff (also served at /mobile/l3/attendance).
router.get('/attendance/members', requireAttendanceStaff, getResidingMembersAndFlats)
router.post('/attendance/mark', requireAttendanceStaff, markAttendanceAndCreateOrder)
router.post('/attendance/guest', requireAttendanceStaff, markGuestAttendance)

// Orders & Delivery Management
router.get('/resident-orders', getResidentOrdersForProperty)
router.patch('/resident-orders/:id/status', updateOrderStatus)
router.post('/resident-orders/:id/complete-delivery', completeRoomDelivery)

// Assigned Deliveries & Proofs
router.get('/assigned-deliveries', getAssignedDeliveries)
router.patch('/delivery/:id/status', updateDeliveryStatus)
router.post('/delivery/:id/complete', completeDeliveryWithProof)

export default router
