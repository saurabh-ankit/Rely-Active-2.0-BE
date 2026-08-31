import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { upload } from '../../middlewares/upload.js'
import {
  createGlobalPackage,
  deleteGlobalPackage,
  getAllGlobalPackages,
  updateGlobalPackage,
} from '../controllers/fnb/globalPackage.controller.js'
import {
  assignPropertyPackage,
  deletePropertyPackage,
  getPropertyPackages,
} from '../controllers/fnb/propertyPackage.controller.js'
import {
  createDish,
  getAllDishes,
  getPropertyDishes,
  setPropertyDishOverride,
  updateDish,
} from '../controllers/fnb/dish.controller.js'
import {
  addOrUpdateMenuItem,
  createMenuSchedule,
  deleteMenu,
  deleteMenuItem,
  getMenuDetails,
  getMenus,
  updateMenuSchedule,
} from '../controllers/fnb/menu.controller.js'
import {
  assignResidentPackage,
  cancelResidentPackage,
  changeResidentPackage,
  getResidentPackage,
  togglePauseResidentPackage,
} from '../controllers/fnb/residentPackage.controller.js'

const router = Router()

// All routes require authentication
router.use(authenticate)

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
router.post('/resident-package', assignResidentPackage)
router.post('/resident-package/change', changeResidentPackage)
router.patch('/resident-package/:id/toggle-pause', togglePauseResidentPackage)
router.post('/residents/:residentId/cancel-package', cancelResidentPackage)

export default router
