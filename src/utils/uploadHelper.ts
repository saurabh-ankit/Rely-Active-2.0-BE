import type { Request } from 'express'

export function getUploadedFilePath(req: Request, fieldName: string): string | undefined {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined
  const file = files?.[fieldName]?.[0]
  return file ? `/uploads/${file.filename}` : undefined
}

export function getUploadedFilePaths(req: Request, fieldName: string): string[] {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined
  const fieldFiles = files?.[fieldName] || []
  return fieldFiles.map((f) => `/uploads/${f.filename}`)
}
