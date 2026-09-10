import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { validateBody } from '../../middlewares/validate/index.js'
import {
  bulkCreateEmployeeShiftSchema,
  coverShiftEmployeeDateSchema,
  createEmployeeShiftSchema,
  createRosterAreaSchema,
  createShiftEmployeeDateSchema,
  createShiftResidentPoolSchema,
  createShiftSchema,
  generateShiftEmployeeDatesSchema,
  markDayOffSchema,
  swapShiftEmployeeDatesSchema,
  updateEmployeeShiftSchema,
  updateRolePoliciesSchema,
  updateRosterAreaSchema,
  updateRosterSettingsSchema,
  updateShiftSchema,
} from '../../validations/roster.validation.js'
import {
  bulkCreateEmployeeShifts,
  createEmployeeShift,
  deleteEmployeeShift,
  exportEmployeeShifts,
  listEmployeeShifts,
  updateEmployeeShift,
} from '../controllers/employeeShift.controller.js'
import {
  coverShiftEmployeeDate,
  createShiftEmployeeDate,
  generateShiftEmployeeDates,
  listShiftEmployeeDates,
  markDayOff,
  swapShiftEmployeeDates,
  unmarkDayOff,
} from '../controllers/shiftEmployeeDate.controller.js'
import {
  createShift,
  deleteShift,
  getRolePolicies,
  getSettings,
  getShift,
  listShifts,
  updateRolePolicies,
  updateSettings,
  updateShift,
} from '../controllers/shift.controller.js'
import {
  createShiftResidentPool,
  deleteShiftResidentPool,
  listShiftResidentPool,
} from '../controllers/shiftResidentPool.controller.js'
import { createArea, deleteArea, getAreas, updateArea } from '../controllers/roster.controller.js'

// ── Shift settings / policies / CRUD ──────────────────────────────────────────
export const shiftRouter = Router({ mergeParams: true })
shiftRouter.use(authenticate)

shiftRouter.get('/settings', getSettings)
shiftRouter.post('/settings', validateBody(updateRosterSettingsSchema), updateSettings)
shiftRouter.get('/settings/policies', getRolePolicies)
shiftRouter.post('/settings/policies', validateBody(updateRolePoliciesSchema), updateRolePolicies)

shiftRouter.get('/', listShifts)
shiftRouter.get('/:id', getShift)
shiftRouter.post('/', validateBody(createShiftSchema), createShift)
shiftRouter.put('/:id', validateBody(updateShiftSchema), updateShift)
shiftRouter.delete('/:id', deleteShift)

// ── Employee shift assignments ────────────────────────────────────────────────
export const employeeShiftRouter = Router({ mergeParams: true })
employeeShiftRouter.use(authenticate)

employeeShiftRouter.get('/', listEmployeeShifts)
employeeShiftRouter.get('/export', exportEmployeeShifts)
employeeShiftRouter.post('/', validateBody(createEmployeeShiftSchema), createEmployeeShift)
employeeShiftRouter.post('/bulk', validateBody(bulkCreateEmployeeShiftSchema), bulkCreateEmployeeShifts)
employeeShiftRouter.put('/:employeeShiftId', validateBody(updateEmployeeShiftSchema), updateEmployeeShift)
employeeShiftRouter.delete('/:employeeShiftId', deleteEmployeeShift)

// ── Shift employee dates ──────────────────────────────────────────────────────
export const shiftEmployeeDateRouter = Router({ mergeParams: true })
shiftEmployeeDateRouter.use(authenticate)

shiftEmployeeDateRouter.get('/', listShiftEmployeeDates)
shiftEmployeeDateRouter.post('/', validateBody(createShiftEmployeeDateSchema), createShiftEmployeeDate)
shiftEmployeeDateRouter.post('/generate', validateBody(generateShiftEmployeeDatesSchema), generateShiftEmployeeDates)
shiftEmployeeDateRouter.put('/:dateId/day-off', validateBody(markDayOffSchema), markDayOff)
shiftEmployeeDateRouter.delete('/:dateId/day-off', unmarkDayOff)
shiftEmployeeDateRouter.put('/:dateId/cover', validateBody(coverShiftEmployeeDateSchema), coverShiftEmployeeDate)
shiftEmployeeDateRouter.put('/:dateId/swap', validateBody(swapShiftEmployeeDatesSchema), swapShiftEmployeeDates)

// ── Shift resident pool ───────────────────────────────────────────────────────
export const shiftResidentPoolRouter = Router({ mergeParams: true })
shiftResidentPoolRouter.use(authenticate)

shiftResidentPoolRouter.get('/', listShiftResidentPool)
shiftResidentPoolRouter.post('/', validateBody(createShiftResidentPoolSchema), createShiftResidentPool)
shiftResidentPoolRouter.delete('/:poolId', deleteShiftResidentPool)

// ── Areas only (legacy /shift-roster mount) ───────────────────────────────────
export const shiftRosterRouter = Router({ mergeParams: true })
shiftRosterRouter.use(authenticate)

shiftRosterRouter.post('/area', validateBody(createRosterAreaSchema), createArea)
shiftRosterRouter.get('/area', getAreas)
shiftRosterRouter.put('/area/update/:areaId', validateBody(updateRosterAreaSchema), updateArea)
shiftRosterRouter.delete('/area/delete/:areaId', deleteArea)
