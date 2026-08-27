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

const router = express.Router()

// ── Property CRUD ─────────────────────────────────────────────────────────────
router.post('/', createProperty)
router.get('/', getAllProperties)
router.get('/:id', getPropertyById)
router.put('/:id', updateProperty)
router.delete('/:id', deleteProperty)

// ── Sub-resource routes ───────────────────────────────────────────────────────
// Add a block/tower to an existing property
router.post('/:id/blocks', addBlock)

// Add a floor to an existing block
router.post('/blocks/:blockId/floors', addFloor)

// Add a unit to an existing floor
router.post('/floors/:floorId/units', addUnit)

export default router
