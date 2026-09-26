import { Router } from 'express'
import type { NextFunction, Response } from 'express'
import { authenticate, AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { upload } from '../../../middlewares/upload.js'
import { categorizeTicketWithAI, processVoiceAssistantQuery } from '../controllers/assistantMobile.controller.js'

const router = Router()

/**
 * Optional authentication: attaches user if valid token exists, but doesn't block conversational queries
 */
const optionalAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return authenticate(req, res, next)
  }
  return next()
}

router.post(
  '/process',
  optionalAuth,
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'voice', maxCount: 1 },
    { name: 'voiceNote', maxCount: 1 },
  ]),
  processVoiceAssistantQuery,
)

router.post('/categorize', optionalAuth, categorizeTicketWithAI)

export default router
