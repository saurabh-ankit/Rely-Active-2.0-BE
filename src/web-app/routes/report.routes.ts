import { Router } from 'express'
import { exportReport, listReports, previewReport } from '../controllers/report.controller.js'
import { authenticate } from '../../middlewares/authenticate.js'
import { validateQuery } from '../../middlewares/validate/index.js'
import { exportReportQuerySchema, previewReportQuerySchema } from '../../validations/report.validation.js'

const router = Router({ mergeParams: true })

// Every report route needs a signed-in Super Admin or Admin (checked in the controller).
router.use(authenticate)

router.get('/', listReports)
router.get('/:report/preview', validateQuery(previewReportQuerySchema), previewReport)
router.get('/:report/export', validateQuery(exportReportQuerySchema), exportReport)

export default router
