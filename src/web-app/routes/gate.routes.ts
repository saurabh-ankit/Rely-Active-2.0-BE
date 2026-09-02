import { Router } from 'express'
import { authenticate } from '../../middlewares/authenticate.js'
import { getDashboardStats, getEntries, getInvites, updateEntryStatus } from '../controllers/gate.controller.js'

const router = Router({ mergeParams: true })

router.use(authenticate)

router.get('/stats', getDashboardStats)
router.get('/entries', getEntries)
router.get('/invites', getInvites)
router.patch('/entries/:entryId/status', updateEntryStatus)

export default router
