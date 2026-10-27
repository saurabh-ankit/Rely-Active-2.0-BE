import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import {
  addEntryItems,
  getDashboardStats,
  getEntries,
  getPreapproved,
  updateEntryStatus,
} from '../controllers/gate.controller.js'

const router = Router({ mergeParams: true })

router.use(authenticate)

router.get('/stats', getDashboardStats)
router.get('/entries', getEntries)
router.get('/preapproved', getPreapproved)
router.patch('/entries/:entryId/status', updateEntryStatus)
router.post('/entries/:entryId/items', addEntryItems)

export default router
