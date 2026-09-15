import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import { authenticate } from '../../../middlewares/authenticate.js'
import { upload } from '../../../middlewares/upload.js'
import { validateBody, validateParams } from '../../../middlewares/validate/index.js'
import {
  addTicketWorkDetailsSchema,
  completeTicketSchema,
  staffTicketIdParamSchema,
  updateTicketTatSchema,
} from '../../../validations/ticketStaff.validation.js'
import {
  addTicketWorkDetails,
  completeTicket,
  getStaffTicketById,
  getStaffTickets,
  getTicketTatHistory,
  startWork,
  updateTicketTat,
} from '../controllers/ticketStaffMobile.controller.js'

const router = Router()

const workDetailsUpload = upload.fields([
  { name: 'photos', maxCount: 10 },
  { name: 'voiceNotes', maxCount: 5 },
])

/** Returns multer failures (file too large, unexpected field, too many files) as 400s. */
function handleWorkDetailsUpload(req: Request, res: Response, next: NextFunction): void {
  workDetailsUpload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Each file must be 10MB or smaller'
          : err.code === 'LIMIT_UNEXPECTED_FILE'
            ? `Unexpected or too many files for field "${err.field}" (photos: max 10, voiceNotes: max 5)`
            : err.message
      res.status(400).json({ success: false, message })
      return
    }
    if (err) {
      next(err)
      return
    }
    next()
  })
}

const validateTicketId = validateParams(staffTicketIdParamSchema)

router.use(authenticate)

router.get('/', getStaffTickets)
router.get('/:id', validateTicketId, getStaffTicketById)
router.post('/:id/start-work', validateTicketId, startWork)
router.patch('/:id/tat', validateTicketId, validateBody(updateTicketTatSchema), updateTicketTat)
router.get('/:id/tat-history', validateTicketId, getTicketTatHistory)
router.post(
  '/:id/work-details',
  validateTicketId,
  handleWorkDetailsUpload,
  validateBody(addTicketWorkDetailsSchema),
  addTicketWorkDetails,
)
router.post(
  '/:id/complete',
  validateTicketId,
  handleWorkDetailsUpload,
  validateBody(completeTicketSchema),
  completeTicket,
)

export default router
