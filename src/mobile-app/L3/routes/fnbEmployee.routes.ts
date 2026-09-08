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

const router = Router()

// Require authentication for employee mobile app endpoints
router.use(authenticate)

// Property & Meal Slots
router.get('/property', getAllProperties)
router.get('/meal-slots', getPropertyMealSlots)
router.get('/meal-slots/global', getGlobalMealSlots)

// Attendance & Members
router.get('/attendance/members', getResidingMembersAndFlats)
router.post('/attendance/mark', markAttendanceAndCreateOrder)
router.post('/attendance/guest', markGuestAttendance)

// Orders & Delivery Management
router.get('/resident-orders', getResidentOrdersForProperty)
router.patch('/resident-orders/:id/status', updateOrderStatus)
router.post('/resident-orders/:id/complete-delivery', completeRoomDelivery)

// Assigned Deliveries & Proofs
router.get('/assigned-deliveries', getAssignedDeliveries)
router.patch('/delivery/:id/status', updateDeliveryStatus)
router.post('/delivery/:id/complete', completeDeliveryWithProof)

export default router
