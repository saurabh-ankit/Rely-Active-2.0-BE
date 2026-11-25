import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { upload } from './upload.js'

/** Work details on a ticket: up to 10 `photos` and 5 `voiceNotes`. */
const workDetailsUpload = upload.fields([
  { name: 'photos', maxCount: 10 },
  { name: 'voiceNotes', maxCount: 5 },
])

/** Returns multer failures (file too large, unexpected field, too many files) as 400s. */
export function handleWorkDetailsUpload(req: Request, res: Response, next: NextFunction): void {
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
