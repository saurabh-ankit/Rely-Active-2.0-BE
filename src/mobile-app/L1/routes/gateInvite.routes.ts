import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import { createInvite, getInvites, getWalkins, updateWalkinStatus } from '../controllers/gateInvite.controller.js'

const router = Router()

router.use(authenticate)

router.post('/', createInvite)
router.get('/', getInvites)
router.get('/walkins', getWalkins)
router.put('/walkins/:id/status', updateWalkinStatus)

export default router
