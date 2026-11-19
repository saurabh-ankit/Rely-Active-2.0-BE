import QRCode from 'qrcode'
import { uploadBase64ToS3 } from '../middlewares/s3/index.js'

const QR_OPTIONS = {
  width: 400,
  margin: 4,
  color: { dark: '#000000', light: '#ffffff' },
} as const

/** Public URL encoded into the asset QR (camera / Lens open this page). */
export function buildAssetPublicUrl(assetId: string): string | null {
  const base = (process.env.PUBLIC_APP_URL || '').trim().replace(/\/+$/, '')
  if (!base) return null
  return `${base}/public/assets/${assetId}`
}

/**
 * Generate a phone-camera-scannable QR image for an asset.
 * Encodes the public details URL; uploads to S3 with base64 fallback.
 */
export async function generateAssetQrImage(assetId: string): Promise<{
  qrCode: string
  qrCodeImage: string | null
  publicUrl: string | null
}> {
  const qrCode = assetId
  const publicUrl = buildAssetPublicUrl(assetId)

  if (!publicUrl) {
    console.warn('PUBLIC_APP_URL is not set; asset QR image skipped for', assetId)
    return { qrCode, qrCodeImage: null, publicUrl: null }
  }

  let qrCodeImage = await QRCode.toDataURL(publicUrl, QR_OPTIONS)

  try {
    const uploadedQr = await uploadBase64ToS3(qrCodeImage, 'assets/asset-qrcodes')
    if (uploadedQr) {
      qrCodeImage = uploadedQr
    }
  } catch (s3Err) {
    console.warn('Asset QR upload to S3 failed, using base64 fallback:', s3Err)
  }

  return { qrCode, qrCodeImage, publicUrl }
}
