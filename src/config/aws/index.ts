// config/s3.ts
import AWS from 'aws-sdk'
import * as dotenv from 'dotenv'
dotenv.config()

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.AWS_S3_ACCESSKEYID || '',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_S3_SECRETACCESSKEY || '',
  region: process.env.AWS_REGION || process.env.AWS_S3_REGION || 'ap-south-1',
})

const BUCKET_NAME = process.env.AWS_BUCKET_NAME || process.env.AWS_S3_BUCKETNAME

export { s3, BUCKET_NAME }
