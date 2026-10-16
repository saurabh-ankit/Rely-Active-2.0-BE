import express from 'express'
import { upload } from '../../middlewares/upload.js'
import {
  createCompany,
  deleteCompany,
  getAllCompanies,
  getCompanyById,
  getSetupStatus,
  updateCompany,
} from '../controllers/company.controller.js'
import { authenticate } from '../../middlewares/authenticate.js'

const router = express.Router()

// Every company route needs a signed-in user.
router.use(authenticate)

const uploadFields = upload.fields([
  { name: 'documents', maxCount: 5 },
  { name: 'document', maxCount: 1 },
  { name: 'accountant_signature', maxCount: 1 },
])

router.post('/', uploadFields, createCompany)
router.get('/', getAllCompanies)
router.get('/company-setup/status', getSetupStatus)
router.get('/:id', getCompanyById)
router.put('/:id', uploadFields, updateCompany)
router.delete('/:id', deleteCompany)

export default router
