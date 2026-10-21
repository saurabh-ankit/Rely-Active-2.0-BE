import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { resourceGuard } from '../../middlewares/authorizeResource.js'
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
  deleteDish,
  deleteGlobalMealSlot,
  deleteGlobalPackage,
  deleteGlobalSpecialSlot,
  deleteMenu,
  deleteMenuItem,
  deletePropertyPackage,
  getAllDishes,
  getAllGlobalPackages,
  getAttendanceSummary,
  getFnbStaffEmployees,
  getGlobalMealSlots,
  getGlobalSpecialSlots,
  getMenuDetails,
  getMenus,
  getPropertyDishes,
  getPropertyMealSlots,
  getPropertyPackages,
  getPropertySpecialSlots,
  getResidingMembersAndFlats,
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

// Sub-module permissions. Reference data several tabs read (dishes, meal slots, packages,
// special slots) only needs Food access to read; changes need that tab's permission.
const FNB_READ = 'FNB' as const
router.use(
  resourceGuard(
    [
      { match: '/attendance', keys: 'FNB.ATTENDANCE' },
      { match: '/members', keys: 'FNB.ATTENDANCE' },
      { match: '/members-by-flat', keys: 'FNB.ATTENDANCE' },
      { match: '/summary', keys: 'FNB.ATTENDANCE' },
      { match: '/menus', keys: 'FNB.MENU_PLANNER' },
      { match: '/menu-items', keys: 'FNB.MENU_PLANNER' },
      { match: '/global-special-slots', keys: 'FNB.MENU_PLANNER', readKeys: FNB_READ },
      { match: '/special-slots', keys: 'FNB.MENU_PLANNER', readKeys: FNB_READ },
      { match: '/property-special-slots', keys: 'FNB.MENU_PLANNER', readKeys: FNB_READ },
      { match: '/property-special-dishes', keys: 'FNB.MENU_PLANNER' },
      { match: '/meal-slots', keys: 'FNB.MEAL_SLOTS', readKeys: FNB_READ },
      { match: '/global-meal-slots', keys: 'FNB.MEAL_SLOTS', readKeys: FNB_READ },
      { match: '/property-meal-slots', keys: 'FNB.MEAL_SLOTS', readKeys: FNB_READ },
      { match: '/global-packages', keys: 'FNB.PACKAGES', readKeys: FNB_READ },
      { match: '/packages', keys: 'FNB.PACKAGES', readKeys: FNB_READ },
      { match: '/property-packages', keys: 'FNB.PACKAGES', readKeys: FNB_READ },
      { match: /^\/properties\/[^/]+\/packages/, keys: 'FNB.PACKAGES', readKeys: FNB_READ },
      { match: '/dishes', keys: 'FNB.DISHES', readKeys: FNB_READ },
      { match: '/property-dishes', keys: 'FNB.DISHES', readKeys: FNB_READ },
      { match: /^\/properties\/[^/]+\/dishes/, keys: 'FNB.DISHES', readKeys: FNB_READ },
      // A resident's food package is also managed from the Resident screens.
      { match: /^\/residents\/[^/]+\/(package|cancel-package)/, keys: ['FNB.PACKAGES', 'RESIDENT'] },
      { match: '/resident-package', keys: ['FNB.PACKAGES', 'RESIDENT'] },
      { match: '/resident-orders', keys: 'FNB.ORDERS' },
      { match: /^\/properties\/[^/]+\/resident-orders/, keys: 'FNB.ORDERS' },
      { match: '/staff-employees', keys: 'FNB.ORDERS' },
    ],
    'FNB',
  ),
)

// ── Food Attendance ──────────────────────────────────────────────────────────
router.get('/attendance/members', getResidingMembersAndFlats)
router.get('/attendance/members-by-flat', getResidingMembersAndFlats)
router.get('/members', getResidingMembersAndFlats)
router.get('/members-by-flat', getResidingMembersAndFlats)

router.get('/attendance/summary', getAttendanceSummary)
router.get('/summary', getAttendanceSummary)

// ── Global Special Slots ─────────────────────────────────────────────────────
router.get('/global-special-slots', getGlobalSpecialSlots)
router.post('/global-special-slots', createGlobalSpecialSlot)
router.put('/global-special-slots/:id', updateGlobalSpecialSlot)
router.delete('/global-special-slots/:id', deleteGlobalSpecialSlot)
router.post('/global-special-slots/:id/assign-locations', assignGlobalSpecialSlotLocations)

// ── Property Special Slots & Dishes ──────────────────────────────────────────
router.get('/special-slots', getPropertySpecialSlots)
router.get('/property-special-slots', getPropertySpecialSlots)
router.put('/special-slots/:id', updatePropertySpecialSlot)
router.put('/property-special-slots/:id', updatePropertySpecialSlot)
router.post('/property-special-slots/sync-dishes', syncPropertySpecialSlotDishes)
router.post('/property-special-slots/:propertySpecialSlotId/dishes', addPropertySpecialDish)
router.delete('/property-special-dishes/:id', removePropertySpecialDish)

// ── Global Meal Slots ────────────────────────────────────────────────────────
router.get('/meal-slots/global', getGlobalMealSlots)
router.get('/global-meal-slots', getGlobalMealSlots)
router.post('/global-meal-slots', createGlobalMealSlot)
router.put('/global-meal-slots/:id', updateGlobalMealSlot)
router.delete('/global-meal-slots/:id', deleteGlobalMealSlot)
router.post('/global-meal-slots/assign', assignMealSlotsToProperty)

// ── Property Meal Slots ──────────────────────────────────────────────────────
router.get('/meal-slots', getPropertyMealSlots)
router.get('/property-meal-slots', getPropertyMealSlots)
router.put('/meal-slots/:id', updatePropertyMealSlotOverride)
router.patch('/meal-slots/:id', updatePropertyMealSlotOverride)
router.put('/property-meal-slots/:id', updatePropertyMealSlotOverride)

// ── Global Packages ──────────────────────────────────────────────────────────
router.get('/global-packages', getAllGlobalPackages)
router.post('/global-packages', createGlobalPackage)
router.put('/global-packages/:id', updateGlobalPackage)
router.delete('/global-packages/:id', deleteGlobalPackage)

// ── Property Packages & Pricing ─────────────────────────────────────────────
router.get('/packages', getPropertyPackages)
router.get('/properties/:locId/packages', getPropertyPackages)
router.post('/property-packages', assignPropertyPackage)
router.delete('/property-packages/:id', deletePropertyPackage)

// ── Dish Catalogue & Property Pricing ───────────────────────────────────────
router.get('/dishes/master', getAllDishes)
router.get('/dishes', getPropertyDishes)
router.post('/dishes', upload.single('image'), createDish)
router.put('/dishes/:id', upload.single('image'), updateDish)
router.delete('/dishes/:id', deleteDish)
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
