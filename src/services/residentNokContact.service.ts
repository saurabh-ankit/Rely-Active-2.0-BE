import { HttpError } from '../middlewares/error/http-error.js'
import { uploadFileToS3 } from '../middlewares/s3/index.js'
import { ResidentNokContact } from '../models/index.js'
import type {
  CreateResidentNokContactInput,
  UpdateResidentNokContactInput,
} from '../validations/residentNokContact.validation.js'
import { getClinicalResident } from './residentClinical.service.js'

const PHOTO_FOLDER = 'residents/nok'
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

const NOK_ATTRIBUTES = [
  'id',
  'residentId',
  'locationId',
  'fullName',
  'relationship',
  'phone',
  'alternatePhone',
  'email',
  'address',
  'photoUrl',
  'createdAt',
  'updatedAt',
]

function formatNokContact(row: ResidentNokContact) {
  return {
    id: row.id,
    residentId: row.residentId,
    locationId: row.locationId,
    fullName: row.fullName,
    relationship: row.relationship,
    phone: row.phone,
    alternatePhone: row.alternatePhone,
    email: row.email,
    address: row.address,
    photoUrl: row.photoUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function uploadNokPhoto(photo?: Express.Multer.File): Promise<string | null> {
  if (!photo) return null
  if (!ALLOWED_IMAGE_TYPES.includes(photo.mimetype)) {
    throw new HttpError(400, 'Profile picture must be a JPEG, PNG, WEBP or HEIC image')
  }
  const result = await uploadFileToS3(photo, PHOTO_FOLDER)
  return result.location
}

async function findResidentNokContact(residentId: string, id: string): Promise<ResidentNokContact> {
  const row = await ResidentNokContact.findOne({ where: { id, residentId, isDeleted: false } })
  if (!row) {
    throw new HttpError(404, 'NOK contact not found')
  }
  return row
}

export async function listResidentNokContacts(residentId: string) {
  await getClinicalResident(residentId)
  const rows = await ResidentNokContact.findAll({
    where: { residentId, isDeleted: false },
    attributes: NOK_ATTRIBUTES,
    order: [['createdAt', 'ASC']],
  })
  return rows.map(formatNokContact)
}

export async function createResidentNokContact(params: {
  residentId: string
  input: CreateResidentNokContactInput
  photo?: Express.Multer.File
  userId: string | null
}) {
  const { residentId, input, photo, userId } = params
  const resident = await getClinicalResident(residentId)
  const photoUrl = await uploadNokPhoto(photo)

  const row = await ResidentNokContact.create({
    residentId,
    locationId: resident.locId,
    fullName: input.fullName,
    relationship: input.relationship ?? null,
    phone: input.phone,
    alternatePhone: input.alternatePhone ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    photoUrl,
    isActive: true,
    isDeleted: false,
    createdBy: userId,
    updatedBy: userId,
  })

  return formatNokContact(row)
}

/**
 * The photo is only replaced when a new one is uploaded; `removePhoto` clears it.
 */
export async function updateResidentNokContact(params: {
  residentId: string
  id: string
  input: UpdateResidentNokContactInput
  photo?: Express.Multer.File
  userId: string | null
}) {
  const { residentId, id, input, photo, userId } = params
  const row = await findResidentNokContact(residentId, id)

  const uploadedPhotoUrl = await uploadNokPhoto(photo)
  let photoUrl = row.photoUrl
  if (uploadedPhotoUrl) photoUrl = uploadedPhotoUrl
  else if (input.removePhoto) photoUrl = null

  await row.update({
    fullName: input.fullName ?? row.fullName,
    relationship: input.relationship !== undefined ? input.relationship : row.relationship,
    phone: input.phone ?? row.phone,
    alternatePhone: input.alternatePhone !== undefined ? input.alternatePhone : row.alternatePhone,
    email: input.email !== undefined ? input.email : row.email,
    address: input.address !== undefined ? input.address : row.address,
    photoUrl,
    updatedBy: userId,
  })

  return formatNokContact(row)
}

export async function deleteResidentNokContact(params: { residentId: string; id: string; userId: string | null }) {
  const { residentId, id, userId } = params
  const row = await findResidentNokContact(residentId, id)
  await row.update({ isDeleted: true, isActive: false, updatedBy: userId })
}
