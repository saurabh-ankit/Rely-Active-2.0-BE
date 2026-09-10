import { Router } from 'express'
import { getResidentDetails } from '../controllers/residentDetails.controller.js'

const router = Router()

/**
 * GET /api/v1/mobile/l1/resident/details
 * Returns comprehensive resident details:
 *  - Personal info (name, email, phone, DOB, gender, blood group, photo)
 *  - Unit & property details (unit number, floor, block, society)
 *  - Family members
 *  - Active food package
 *  - Recent tickets (last 10)
 *  - Stats summary
 *
 * Requires: Authorization: Bearer <token>
 */
router.get('/details', getResidentDetails)

export default router
