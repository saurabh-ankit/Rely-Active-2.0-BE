import bcrypt from 'bcryptjs'
import { HttpError } from '../middlewares/error/http-error.js'
import { uploadFileToS3 } from '../middlewares/s3/index.js'
import { PropertyUnit, Resident, ResidentFamilyMember, ResidentGuardian } from '../models/index.js'
import { checkUsernameAvailability } from '../utils/usernameValidation.js'
import type {
  CreateResidentGuardianInput,
  UpdateResidentGuardianInput,
} from '../validations/residentGuardian.validation.js'

const PHOTO_FOLDER = 'residents/guardians'
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

/** Who a guardian can act for: the flat's resident or a residing family member. */
export type CareRecipientType = 'RESIDENT' | 'FAMILY_MEMBER'

export interface CareRecipient {
  type: CareRecipientType
  id: string
  residentId: string
  familyMemberId: string | null
  firstName: string
  lastName: string | null
  fullName: string
  relation: string
  gender: string | null
  dob: string | null
  age: number | null
  photoUrl: string | null
  phone: string | null
  unitNumber: string | null
}

export function formatGuardian(row: ResidentGuardian) {
  return {
    id: row.id,
    residentId: row.residentId,
    locationId: row.locationId,
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: `${row.firstName} ${row.lastName ?? ''}`.trim(),
    relation: row.relation,
    gender: row.gender,
    phone: row.phone,
    email: row.email,
    address: row.address,
    photoUrl: row.photoUrl,
    username: row.username,
    lastLoginAt: row.lastLoginAt,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function uploadGuardianPhoto(photo?: Express.Multer.File): Promise<string | null> {
  if (!photo) return null
  if (!ALLOWED_IMAGE_TYPES.includes(photo.mimetype)) {
    throw new HttpError(400, 'Profile picture must be a JPEG, PNG, WEBP or HEIC image')
  }
  const result = await uploadFileToS3(photo, PHOTO_FOLDER)
  return result.location
}

async function findResident(residentId: string): Promise<Resident> {
  const resident = await Resident.findOne({ where: { id: residentId, isDeleted: false } })
  if (!resident) throw new HttpError(404, 'Resident not found')
  return resident
}

async function findGuardian(residentId: string, id: string): Promise<ResidentGuardian> {
  const row = await ResidentGuardian.findOne({ where: { id, residentId, isDeleted: false } })
  if (!row) throw new HttpError(404, 'Guardian not found')
  return row
}

async function assertUsernameFree(username: string, excludeGuardianId?: string) {
  const taken = await checkUsernameAvailability(username, { excludeGuardianId: excludeGuardianId ?? null })
  if (taken) throw new HttpError(400, 'Username is already existing')
}

/** A flat (unit) can have only one guardian, whichever resident record it was added under. */
async function assertFlatHasNoGuardian(resident: Resident) {
  const flatResidents = await Resident.findAll({
    where: { unitId: resident.unitId, isDeleted: false },
    attributes: ['id'],
  })
  const existing = await ResidentGuardian.count({
    where: { residentId: flatResidents.map((r) => r.id), isDeleted: false },
  })
  if (existing > 0) throw new HttpError(409, 'This flat already has a guardian. Only one guardian is allowed per flat')
}

export async function listResidentGuardians(residentId: string) {
  await findResident(residentId)
  const rows = await ResidentGuardian.findAll({
    where: { residentId, isDeleted: false },
    order: [['createdAt', 'ASC']],
  })
  return rows.map(formatGuardian)
}

export async function createResidentGuardian(params: {
  residentId: string
  input: CreateResidentGuardianInput
  photo?: Express.Multer.File
  userId: string | null
}) {
  const { residentId, input, photo, userId } = params
  const resident = await findResident(residentId)
  await assertFlatHasNoGuardian(resident)
  await assertUsernameFree(input.username)
  const photoUrl = await uploadGuardianPhoto(photo)

  const row = await ResidentGuardian.create({
    residentId,
    locationId: resident.locId,
    firstName: input.firstName,
    lastName: input.lastName ?? null,
    relation: input.relation,
    gender: input.gender ?? null,
    phone: input.phone,
    email: input.email ?? null,
    address: input.address ?? null,
    photoUrl,
    username: input.username,
    passwordHash: await bcrypt.hash(input.password, 10),
    isActive: true,
    isDeleted: false,
    createdBy: userId,
    updatedBy: userId,
  })
  return formatGuardian(row)
}

/** The photo is only replaced when a new one is uploaded; `removePhoto` clears it. */
export async function updateResidentGuardian(params: {
  residentId: string
  id: string
  input: UpdateResidentGuardianInput
  photo?: Express.Multer.File
  userId: string | null
}) {
  const { residentId, id, input, photo, userId } = params
  const row = await findGuardian(residentId, id)
  if (input.username && input.username !== row.username) await assertUsernameFree(input.username, row.id)

  const uploadedPhotoUrl = await uploadGuardianPhoto(photo)
  let photoUrl = row.photoUrl
  if (uploadedPhotoUrl) photoUrl = uploadedPhotoUrl
  else if (input.removePhoto) photoUrl = null

  await row.update({
    firstName: input.firstName ?? row.firstName,
    lastName: input.lastName !== undefined ? input.lastName : row.lastName,
    relation: input.relation ?? row.relation,
    gender: input.gender !== undefined ? input.gender : row.gender,
    phone: input.phone ?? row.phone,
    email: input.email !== undefined ? input.email : row.email,
    address: input.address !== undefined ? input.address : row.address,
    username: input.username ?? row.username,
    ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 10) } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    photoUrl,
    updatedBy: userId,
  })
  return formatGuardian(row)
}

export async function deleteResidentGuardian(params: { residentId: string; id: string; userId: string | null }) {
  const row = await findGuardian(params.residentId, params.id)
  await row.update({ isDeleted: true, isActive: false, updatedBy: params.userId })
}

// ── Care recipients (who a guardian can act for) ────────────────────────────

const ageFrom = (dob: Date | string | null | undefined): number | null => {
  if (!dob) return null
  const birth = new Date(`${String(dob).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
    age--
  }
  return age >= 0 ? age : null
}

const dobString = (dob: Date | string | null | undefined) => (dob ? String(dob).slice(0, 10) : null)

/**
 * The flat's residing people a guardian looks after: the resident (when residing) and every
 * residing family member.
 */
export async function listCareRecipients(residentId: string): Promise<CareRecipient[]> {
  const resident = (await Resident.findOne({
    where: { id: residentId, isDeleted: false },
    include: [
      { model: PropertyUnit, as: 'unit', attributes: ['id', 'unit_number'], required: false },
      {
        model: ResidentFamilyMember,
        as: 'familyMembers',
        where: { isDeleted: false, isResiding: true },
        required: false,
      },
    ],
  })) as (Resident & { unit?: PropertyUnit & { unit_number?: string }; familyMembers?: ResidentFamilyMember[] }) | null
  if (!resident) return []
  const unitNumber = resident.unit?.unit_number ?? null

  const people: CareRecipient[] = []
  if (resident.isResiding) {
    people.push({
      type: 'RESIDENT',
      id: resident.id,
      residentId: resident.id,
      familyMemberId: null,
      firstName: resident.firstName,
      lastName: resident.lastName ?? null,
      fullName: `${resident.firstName} ${resident.lastName ?? ''}`.trim(),
      relation: 'Resident',
      gender: resident.gender ?? null,
      dob: dobString(resident.dob),
      age: ageFrom(resident.dob),
      photoUrl: resident.photoUrl ?? null,
      phone: resident.phone ?? null,
      unitNumber,
    })
  }
  for (const member of resident.familyMembers ?? []) {
    people.push({
      type: 'FAMILY_MEMBER',
      id: member.id,
      residentId: resident.id,
      familyMemberId: member.id,
      firstName: member.firstName,
      lastName: member.lastName ?? null,
      fullName: `${member.firstName} ${member.lastName ?? ''}`.trim(),
      relation: member.relation,
      gender: member.gender ?? null,
      dob: dobString(member.dob),
      age: ageFrom(member.dob),
      photoUrl: member.photoUrl ?? null,
      phone: member.phone ?? null,
      unitNumber,
    })
  }
  return people
}

/**
 * The person a guardian request acts for, from the `X-Acting-For: RESIDENT:<id>` /
 * `FAMILY_MEMBER:<id>` header. Without the header it defaults to the first person; an id that
 * isn't one of the flat's residing people is refused.
 */
export function resolveActingRecipient(recipients: CareRecipient[], header: unknown): CareRecipient | null {
  const raw = typeof header === 'string' ? header.trim() : ''
  if (!raw) return recipients[0] ?? null
  const [type, id] = raw.split(':')
  return recipients.find((r) => r.type === type?.toUpperCase() && r.id === id) ?? null
}
