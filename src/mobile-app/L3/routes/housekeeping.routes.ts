import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import { authenticate } from '../../../middlewares/authenticate.js'
import { upload } from '../../../middlewares/upload.js'
import { validateBody, validateParams, validateQuery } from '../../../middlewares/validate/index.js'
import {
  completeHousekeepingTaskSchema,
  housekeepingRosterQuerySchema,
  housekeepingShiftDateIdParamSchema,
  housekeepingSummaryQuerySchema,
  housekeepingTasksQuerySchema,
} from '../../../validations/housekeeping.validation.js'
import {
  completeHousekeepingTask,
  getHousekeepingRoster,
  getHousekeepingSummary,
  getHousekeepingTaskById,
  getHousekeepingTasks,
  requireHousekeepingStaff,
  startHousekeepingTask,
} from '../controllers/housekeeping.controller.js'

const router = Router()

const photoUpload = upload.fields([
  { name: 'photo', maxCount: 10 },
  { name: 'photos', maxCount: 10 },
])

function handlePhotoUpload(req: Request, res: Response, next: NextFunction): void {
  photoUpload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Each file must be 10MB or smaller'
          : err.code === 'LIMIT_UNEXPECTED_FILE'
            ? `Unexpected or too many files for field "${err.field}" (photo/photos: max 10)`
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

const validateShiftDateId = validateParams(housekeepingShiftDateIdParamSchema)

router.use(authenticate, requireHousekeepingStaff)

router.get('/tasks', validateQuery(housekeepingTasksQuerySchema), getHousekeepingTasks)
router.get('/summary', validateQuery(housekeepingSummaryQuerySchema), getHousekeepingSummary)
router.get('/roster', validateQuery(housekeepingRosterQuerySchema), getHousekeepingRoster)
router.get('/tasks/:shiftDateId', validateShiftDateId, getHousekeepingTaskById)
router.post('/tasks/:shiftDateId/start', validateShiftDateId, startHousekeepingTask)
router.post(
  '/tasks/:shiftDateId/complete',
  validateShiftDateId,
  handlePhotoUpload,
  validateBody(completeHousekeepingTaskSchema),
  completeHousekeepingTask,
)

export default router
