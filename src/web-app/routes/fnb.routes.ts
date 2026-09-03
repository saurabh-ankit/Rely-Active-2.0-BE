import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { upload } from '../../middlewares/upload.js'
import {
  addOrUpdateMenuItem,
  addPropertySpecialDish,
  assignDeliveryEmployee,
  assignGlobalSpecialSlotLocations,
  assignMealSlotsToProperty,
  assignPropertyPackage,
  assignResidentPackage,
  cancelResidentPackage,
  changeResidentPackage,
  completeRoomDelivery,
  createDish,
  createGlobalMealSlot,
  createGlobalPackage,
  createGlobalSpecialSlot,
  createMenuSchedule,
  deleteGlobalMealSlot,
  deleteGlobalPackage,
  deleteGlobalSpecialSlot,
  deleteMenu,
  deleteMenuItem,
  deletePropertyPackage,
  getAllDishes,
  getAllGlobalPackages,
  getFnbStaffEmployees,
  getGlobalMealSlots,
  getGlobalSpecialSlots,
  getMenuDetails,
  getMenus,
  getPropertyDishes,
  getPropertyMealSlots,
  getPropertyPackages,
  getPropertySpecialSlots,
  getResidentOrdersForProperty,
  getResidentPackage,
  removePropertySpecialDish,
  setPropertyDishOverride,
  syncPropertySpecialSlotDishes,
  togglePauseResidentPackage,
  updateDish,
  updateGlobalMealSlot,
  updateGlobalPackage,
  updateGlobalSpecialSlot,
  updateMenuSchedule,
  updateOrderStatus,
  updatePropertyMealSlotOverride,
  updatePropertySpecialSlot,
} from '../controllers/fnb.controller.js'

const router = Router()

// All routes require authentication
router.use(authenticate)

// ── Global Special Slots ─────────────────────────────────────────────────────
router.get('/global-special-slots', getGlobalSpecialSlots)
router.post('/global-special-slots', createGlobalSpecialSlot)
router.put('/global-special-slots/:id', updateGlobalSpecialSlot)
router.delete('/global-special-slots/:id', deleteGlobalSpecialSlot)
router.post('/global-special-slots/:id/assign-locations', assignGlobalSpecialSlotLocations)

// ── Property Special Slots & Dishes ──────────────────────────────────────────
router.get('/property-special-slots', getPropertySpecialSlots)
router.put('/property-special-slots/:id', updatePropertySpecialSlot)
router.post('/property-special-slots/sync-dishes', syncPropertySpecialSlotDishes)
router.post('/property-special-slots/:propertySpecialSlotId/dishes', addPropertySpecialDish)
router.delete('/property-special-dishes/:id', removePropertySpecialDish)

// ── Global Meal Slots ────────────────────────────────────────────────────────
router.get('/global-meal-slots', getGlobalMealSlots)
router.post('/global-meal-slots', createGlobalMealSlot)
router.put('/global-meal-slots/:id', updateGlobalMealSlot)
router.delete('/global-meal-slots/:id', deleteGlobalMealSlot)
router.post('/global-meal-slots/assign', assignMealSlotsToProperty)

// ── Property Meal Slots ──────────────────────────────────────────────────────
router.get('/property-meal-slots', getPropertyMealSlots)
router.put('/property-meal-slots/:id', updatePropertyMealSlotOverride)

// ── Global Packages ──────────────────────────────────────────────────────────
router.get('/global-packages', getAllGlobalPackages)
router.post('/global-packages', createGlobalPackage)
router.put('/global-packages/:id', updateGlobalPackage)
router.delete('/global-packages/:id', deleteGlobalPackage)

// ── Property Packages & Pricing ─────────────────────────────────────────────
router.get('/properties/:locId/packages', getPropertyPackages)
router.post('/property-packages', assignPropertyPackage)
router.delete('/property-packages/:id', deletePropertyPackage)

// ── Dish Catalogue & Property Pricing ───────────────────────────────────────
router.get('/dishes', getAllDishes)
router.post('/dishes', upload.single('image'), createDish)
router.put('/dishes/:id', upload.single('image'), updateDish)
router.get('/properties/:locId/dishes', getPropertyDishes)
router.post('/property-dishes', setPropertyDishOverride)

// ── Flexible Menu Schedules ──────────────────────────────────────────────────
router.get('/menus', getMenus)
router.get('/menus/:id', getMenuDetails)
router.post('/menus', createMenuSchedule)
router.put('/menus/:id', updateMenuSchedule)
router.post('/menu-items', addOrUpdateMenuItem)
router.delete('/menu-items/:id', deleteMenuItem)
router.delete('/menus/:id', deleteMenu)

// ── Resident Package Subscription ──────────────────────────────────────────
router.get('/residents/:residentId/package', getResidentPackage)
router.get('/resident-package/:residentId', getResidentPackage)
router.post('/resident-package', assignResidentPackage)
router.post('/resident-package/change', changeResidentPackage)
router.patch('/resident-package/:id/toggle-pause', togglePauseResidentPackage)
router.post('/residents/:residentId/cancel-package', cancelResidentPackage)

// ── Resident Orders Management ──────────────────────────────────────────────
router.get('/resident-orders', getResidentOrdersForProperty)
router.get('/properties/:locId/resident-orders', getResidentOrdersForProperty)
router.patch('/resident-orders/:id/status', updateOrderStatus)
router.post('/resident-orders/:id/assign-delivery', assignDeliveryEmployee)
router.post('/resident-orders/:id/complete-delivery', completeRoomDelivery)
router.get('/staff-employees', getFnbStaffEmployees)

export default router
