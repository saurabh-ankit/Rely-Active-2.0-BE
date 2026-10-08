import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import { authenticate } from '../../../middlewares/authenticate.js'
import { upload } from '../../../middlewares/upload.js'
import { removeResidentProfilePhoto, updateResidentProfilePhoto } from '../controllers/residentProfile.controller.js'

const router = Router()

const photoUpload = upload.single('photo')

/** Returns multer failures (file too large, wrong field name) as 400s. */
function handlePhotoUpload(req: Request, res: Response, next: NextFunction): void {
  photoUpload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Photo must be 10MB or smaller'
          : err.code === 'LIMIT_UNEXPECTED_FILE'
            ? `Unexpected file field "${err.field}" (expected "photo")`
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

router.use(authenticate)

/**
 * PUT /api/v1/mobile/l1/resident/profile-photo
 * multipart/form-data, field "photo" (JPEG, PNG, WebP or HEIC, max 10MB)
 * Response: { success, message, data: { photoUrl } }
 */
router.put('/', handlePhotoUpload, updateResidentProfilePhoto)

/**
 * DELETE /api/v1/mobile/l1/resident/profile-photo
 * Clears the photo so the app falls back to initials.
 */
router.delete('/', removeResidentProfilePhoto)

export default router
