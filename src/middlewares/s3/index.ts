import { S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import dotenv from 'dotenv'
import { v4 as uuidv4 } from 'uuid'

dotenv.config()

const ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || process.env.AWS_S3_ACCESSKEYID || ''
const SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_S3_SECRETACCESSKEY || ''
const REGION = process.env.AWS_REGION || process.env.AWS_S3_REGION || 'ap-south-1'
const BUCKET_NAME = process.env.AWS_BUCKET_NAME || process.env.AWS_S3_BUCKETNAME || 'reverely'
const ROOT_DIR = process.env.AWS_S3_ROOTDIR || 'active-2.0'

const s3Client = new S3Client({
  region: REGION,
  ...(ACCESS_KEY_ID && SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: ACCESS_KEY_ID,
          secretAccessKey: SECRET_ACCESS_KEY,
        },
      }
    : {}),
})

export interface UploadResult {
  key: string
  bucket: string
  location: string
  contentType: string
  size: number
}

export async function uploadFileToS3(
  file: { originalname?: string; buffer: Buffer; mimetype: string; size?: number },
  folder?: string,
): Promise<UploadResult> {
  try {
    if (!file || !file.buffer) {
      throw new Error('No file provided')
    }

    const folderPath = folder ? `${folder}/` : ''
    const fileName = file.originalname ? `${uuidv4()}_${file.originalname}` : `${uuidv4()}`
    const key = `${ROOT_DIR}/${folderPath}${fileName}`

    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      },
      queueSize: 4,
      partSize: 1024 * 1024 * 5,
      leavePartsOnError: false,
    })

    await upload.done()

    const location = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`

    return {
      key,
      bucket: BUCKET_NAME,
      location,
      contentType: file.mimetype,
      size: file.size || file.buffer.length,
    }
  } catch (err: unknown) {
    console.error('Error uploading to S3:', err)
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to upload file to S3: ${message}`)
  }
}

export async function uploadBase64ToS3(
  dataUrl: string | null | undefined,
  folder: string = 'uploads',
): Promise<string | null> {
  if (!dataUrl || typeof dataUrl !== 'string') {
    return null
  }
  if (!dataUrl.startsWith('data:')) {
    return dataUrl
  }

  const match = dataUrl.match(/^data:([a-zA-Z0-9+./-]+);base64,(.+)$/)
  if (!match || !match[1] || !match[2]) {
    return dataUrl
  }

  const mimetype: string = match[1]
  const base64Data: string = match[2]
  const buffer = Buffer.from(base64Data, 'base64')
  const ext = mimetype.includes('/') ? mimetype.split('/')[1] : 'png'
  const originalname = `file_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`

  const uploadResult = await uploadFileToS3({ buffer, mimetype, originalname }, folder)
  return uploadResult.location
}

export { s3Client }
