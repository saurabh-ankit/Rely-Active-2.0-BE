import { Router } from 'express'
import { authenticate } from '../../../middlewares/authenticate.js'
import {
  createPreapproved,
  getPreapproved,
  getWalkins,
  updateWalkinStatus,
  updatePreapproved,
  deletePreapproved,
  getGuestMasterList,
  createGuestMaster,
  updateGuestMaster,
  deleteGuestMaster,
} from '../controllers/gns.controller.js'

const router = Router()

router.use(authenticate)

// Preapproved & Walkins
router.post('/preapproved', createPreapproved)
router.get('/preapproved', getPreapproved)
router.put('/preapproved/:id', updatePreapproved)
router.delete('/preapproved/:id', deletePreapproved)
router.get('/preapproved/walkins', getWalkins)
router.put('/preapproved/walkins/:id/status', updateWalkinStatus)

// Guest Master
router.get('/guest-master', getGuestMasterList)
router.post('/guest-master', createGuestMaster)
router.put('/guest-master/:id', updateGuestMaster)
router.delete('/guest-master/:id', deleteGuestMaster)

export default router
