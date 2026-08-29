import express from 'express'
import {
  addBlock,
  addFloor,
  addUnit,
  createProperty,
  deleteProperty,
  getAllProperties,
  getPropertyById,
  updateProperty,
} from '../controllers/property.controller.js'
import { validateBody } from '../../middlewares/validate/index.js'
import { addBlockSchema, createPropertySchema, updatePropertySchema } from '../../validations/property.validation.js'

const router = express.Router()

// ── Property CRUD ─────────────────────────────────────────────────────────────
router.post('/', validateBody(createPropertySchema), createProperty)
router.get('/', getAllProperties)
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
