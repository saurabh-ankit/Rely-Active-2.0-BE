import type { Request, Response, NextFunction } from 'express'
import { upload } from '../../middlewares/upload.js'
import { uploadFileToS3 } from '../../middlewares/s3/index.js'
import { successResponse } from '../../utils/response/index.js'

export function receiveInventoryImage(req: Request, res: Response, next: NextFunction) {
  upload.single('image')(req, res, (error) => {
    if (error) {
      res.status(400).json({ success: false, message: 'Upload one JPG, PNG or GIF image, up to 10 MB' })
      return
    }
    next()
  })
}
export async function uploadInventoryImage(req: Request, res: Response, next: NextFunction) {
  const file = req.file
  const signature = file?.buffer
  const isPng = signature && signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const isJpeg = signature && signature[0] === 255 && signature[1] === 216 && signature[2] === 255
  const isGif = signature && ['GIF87a', 'GIF89a'].includes(signature.subarray(0, 6).toString('ascii'))
  const extension =
    isPng && file?.mimetype === 'image/png'
      ? 'png'
      : isJpeg && file?.mimetype === 'image/jpeg'
        ? 'jpg'
        : isGif && file?.mimetype === 'image/gif'
          ? 'gif'
          : null
  if (!file || !extension) {
    res.status(400).json({ success: false, message: 'Choose a valid JPG, PNG or GIF image' })
    return
  }
  try {
    const result = await uploadFileToS3({ ...file, originalname: `category.${extension}` }, 'inventory/categories')
    res.status(201).json(successResponse('Category image uploaded', { image: result.location }))
  } catch (error) {
    next(error)
  }
}
