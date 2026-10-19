import express from 'express'
import {
  addBlock,
  addFloor,
  addUnit,
  createProperty,
  deleteProperty,
  getAllProperties,
  getPropertyById,
  getUnitPicker,
  updateProperty,
} from '../controllers/property.controller.js'
import { getPropertyAmenitiesForProperty, setPropertyAmenitiesForProperty } from '../controllers/amenity.controller.js'
import { validateBody, validateParams } from '../../middlewares/validate/index.js'
import { addBlockSchema, createPropertySchema, updatePropertySchema } from '../../validations/property.validation.js'
import { authenticate } from '../../middlewares/authenticate.js'
import { propertyIdByIdParamSchema, setPropertyAmenitiesSchema } from '../../validations/amenity.validation.js'

const router = express.Router()

// Every property route needs a signed-in user.
router.use(authenticate)

// ── Property CRUD ─────────────────────────────────────────────────────────────
router.post('/', validateBody(createPropertySchema), createProperty)
router.get('/', getAllProperties)
router.get('/:id/unit-picker', getUnitPicker)
router.get('/:id/amenities', validateParams(propertyIdByIdParamSchema), getPropertyAmenitiesForProperty)
router.put(
  '/:id/amenities',
  validateParams(propertyIdByIdParamSchema),
  validateBody(setPropertyAmenitiesSchema),
  setPropertyAmenitiesForProperty,
)
router.get('/:id', getPropertyById)
router.put('/:id', validateBody(updatePropertySchema), updateProperty)
router.delete('/:id', deleteProperty)

// ── Sub-resource routes ───────────────────────────────────────────────────────
// Add a block/tower to an existing property
router.post('/:id/blocks', validateBody(addBlockSchema), addBlock)

// Add a floor to an existing block
router.post('/blocks/:blockId/floors', addFloor)

// Add a unit to an existing floor
router.post('/floors/:floorId/units', addUnit)

export default router
