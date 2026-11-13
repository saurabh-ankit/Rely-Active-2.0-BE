import { Router } from 'express'
import { getPublicAssetById } from '../controllers/asset.controller.js'

const router = Router()

/** Unauthenticated asset details for camera / Google Lens QR scans. */
router.get('/assets/:assetId', getPublicAssetById)

export default router
