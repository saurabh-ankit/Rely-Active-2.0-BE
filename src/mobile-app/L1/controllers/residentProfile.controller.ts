/**
 * residentProfile.controller.ts
 *
 * PUT    /api/v1/mobile/l1/resident/profile-photo   multipart field: photo
 * DELETE /api/v1/mobile/l1/resident/profile-photo
 *
 * Changes the profile photo of whoever is signed in: the primary resident, or a
 * family member when the token belongs to one.
 */

import type { Response } from 'express'
import { Resident, ResidentFamilyMember } from '../../../models/index.js'
import type { AuthenticatedRequest } from '../../../middlewares/authenticate.js'
import { HttpError } from '../../../middlewares/error/http-error.js'
import { uploadFileToS3 } from '../../../middlewares/s3/index.js'

const PROFILE_PHOTO_S3_FOLDER = 'residents/avatars'
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

function sendError(res: Response, err: unknown, logLabel: string): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, message: err.message })
    return
  }
  console.error(logLabel, err)
  res.status(500).json({ success: false, message: err instanceof Error ? err.message : 'Unknown error' })
}

/** Saves the photo on the family member if signed in as one, else on the resident. */
async function saveProfilePhoto(req: AuthenticatedRequest, photoUrl: string | null): Promise<void> {
  const updatedBy = req.user?.id ?? null

  const familyMemberId = req.user?.familyMemberId
  if (familyMemberId) {
    const familyMember = await ResidentFamilyMember.findOne({ where: { id: familyMemberId, isDeleted: false } })
    if (!familyMember) throw new HttpError(404, 'Family member profile not found')
    await familyMember.update({ photoUrl, updatedBy })
    return
  }

  const residentId = req.user?.residentId
  if (!residentId) throw new HttpError(403, 'This is only available to residents')
  const resident = await Resident.findByPk(residentId)
  if (!resident) throw new HttpError(404, 'Resident profile not found')
  await resident.update({ photoUrl, updatedBy })
}

/** PUT /api/v1/mobile/l1/resident/profile-photo */
export async function updateResidentProfilePhoto(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const file = req.file
    if (!file) throw new HttpError(400, 'Please attach a photo in the "photo" field')
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new HttpError(400, 'Photo must be a JPEG, PNG, WebP or HEIC image')
    }

    const uploaded = await uploadFileToS3(file, PROFILE_PHOTO_S3_FOLDER)
    await saveProfilePhoto(req, uploaded.location)

    res.status(200).json({
      success: true,
      message: 'Profile photo updated successfully',
      data: { photoUrl: uploaded.location },
    })
  } catch (err) {
    sendError(res, err, 'Update Resident Profile Photo Error:')
  }
}

/** DELETE /api/v1/mobile/l1/resident/profile-photo */
export async function removeResidentProfilePhoto(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    await saveProfilePhoto(req, null)

    res.status(200).json({ success: true, message: 'Profile photo removed', data: { photoUrl: null } })
  } catch (err) {
    sendError(res, err, 'Remove Resident Profile Photo Error:')
  }
}
