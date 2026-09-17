import { z } from 'zod'
import { EMAIL_REGEX, PHONE_REGEX } from './company.validation.js'

const NAME_REGEX = /^[a-zA-Z\s]+$/
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/
const EXPERIENCE_REGEX = /^\d{1,2}$/
const BLOOD_GROUP_VALUES = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] as const
const GENDER_VALUES = ['MALE', 'FEMALE', 'OTHER'] as const

const todayYmdLocal = (): string => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const optionalNameField = z
  .string()
  .optional()
  .refine((val) => !val || NAME_REGEX.test(val.trim()), {
    message: 'Name can only contain letters and spaces',
  })
  .refine((val) => !val || val.trim().length <= 50, {
    message: 'Name cannot exceed 50 characters',
  })

const optionalPhoneField = (message: string) =>
  z
    .string()
    .optional()
    .refine((val) => !val || PHONE_REGEX.test(val.trim()), {
      message,
    })

const optionalDateOfBirth = z
  .string()
  .optional()
  .refine((val) => !val || /^\d{4}-\d{2}-\d{2}$/.test(val.trim()), {
    message: 'Date of birth must be a valid date (YYYY-MM-DD)',
  })
  .refine((val) => !val || val.trim() <= todayYmdLocal(), {
    message: 'Date of birth cannot be a future date',
  })

const optionalDateOfJoining = z
  .string()
  .optional()
  .refine((val) => !val || /^\d{4}-\d{2}-\d{2}$/.test(val.trim()), {
    message: 'Date of joining must be a valid date (YYYY-MM-DD)',
  })
  .refine((val) => !val || val.trim() <= todayYmdLocal(), {
    message: 'Date of joining cannot be a future date',
  })

const optionalExperience = z
  .string()
  .optional()
  .refine((val) => !val || EXPERIENCE_REGEX.test(val.trim()), {
    message: 'Experience must be a number between 0 and 99',
  })

const optionalGender = z
  .string()
  .optional()
  .refine((val) => !val || GENDER_VALUES.includes(val as (typeof GENDER_VALUES)[number]), {
    message: 'Please select a valid gender',
  })

const optionalBloodGroup = z
  .string()
  .optional()
  .refine((val) => !val || BLOOD_GROUP_VALUES.includes(val as (typeof BLOOD_GROUP_VALUES)[number]), {
    message: 'Please select a valid blood group',
  })

const profileFields = {
  gender: optionalGender,
  dateOfBirth: optionalDateOfBirth,
  date_of_birth: optionalDateOfBirth,
  bloodGroup: optionalBloodGroup,
  blood_group: optionalBloodGroup,
  qualification: z
    .string()
    .optional()
    .refine((val) => !val || val.trim().length <= 150, {
      message: 'Qualification cannot exceed 150 characters',
    }),
  experience: optionalExperience,
  address: z
    .string()
    .optional()
    .refine((val) => !val || val.trim().length <= 500, {
      message: 'Address cannot exceed 500 characters',
    }),
  employeeCode: z.string().optional(),
  employee_code: z.string().optional(),
}

export const createUserSchema = z
  .object({
    firstName: optionalNameField,
    first_name: optionalNameField,
    lastName: optionalNameField,
    last_name: optionalNameField,
    username: z
      .string()
      .optional()
      .refine((val) => !val || USERNAME_REGEX.test(val.trim()), {
        message: 'Username must be 3–30 characters and contain only letters, numbers, or underscore',
      }),
    email: z
      .string()
      .optional()
      .refine((val) => !val || EMAIL_REGEX.test(val.trim()), {
        message: 'Invalid email address format',
      }),
    phone: optionalPhoneField('Phone number must start with a digit between 6-9 and be exactly 10 digits'),
    password: z
      .string()
      .optional()
      .refine((val) => !val || val.length >= 6, {
        message: 'Password must be at least 6 characters long',
      }),
    emergencyContact: optionalPhoneField(
      'Emergency contact number must start with a digit between 6-9 and be exactly 10 digits',
    ),
    emergency_contact: optionalPhoneField(
      'Emergency contact number must start with a digit between 6-9 and be exactly 10 digits',
    ),
    roleCode: z.string().optional(),
    companyId: z.string().optional(),
    defaultLocationId: z.string().optional(),
    departmentId: z.string().optional(),
    jobCategoryId: z.string().optional(),
    dateOfJoining: optionalDateOfJoining,
    date_of_joining: optionalDateOfJoining,
    propertyIds: z.array(z.string()).optional(),
    property_ids: z.array(z.string()).optional(),
    properties: z.array(z.string()).optional(),
    locIds: z.array(z.string()).optional(),
    locationIds: z.array(z.string()).optional(),
    // Doctors only: specializations assigned with the user.
    specializationIds: z.union([z.array(z.string()), z.string()]).optional(),
    primarySpecializationId: z.string().optional(),
    managerId: z.string().optional(),
    manager_id: z.string().optional(),
    ...profileFields,
  })
  .passthrough()
  .refine(
    (data) => {
      const fName = data.firstName || data.first_name
      return Boolean(fName && fName.trim().length > 0)
    },
    { message: 'First name is required', path: ['firstName'] },
  )
  .refine(
    (data) => {
      const fName = data.firstName || data.first_name
      return !fName || NAME_REGEX.test(fName.trim())
    },
    { message: 'First name can only contain letters and spaces', path: ['firstName'] },
  )
  .refine(
    (data) => {
      const lName = data.lastName || data.last_name
      return Boolean(lName && lName.trim().length > 0)
    },
    { message: 'Last name is required', path: ['lastName'] },
  )
  .refine(
    (data) => {
      const lName = data.lastName || data.last_name
      return !lName || NAME_REGEX.test(lName.trim())
    },
    { message: 'Last name can only contain letters and spaces', path: ['lastName'] },
  )
  .refine(
    (data) => {
      return Boolean(data.email && data.email.trim().length > 0 && EMAIL_REGEX.test(data.email.trim()))
    },
    { message: 'Email address is required', path: ['email'] },
  )
  .refine(
    (data) => {
      return Boolean(data.phone && data.phone.trim().length > 0 && PHONE_REGEX.test(data.phone.trim()))
    },
    { message: 'Phone number is required', path: ['phone'] },
  )
  .refine(
    (data) => {
      const rawProps = data.propertyIds || data.property_ids || data.properties || data.locIds || data.locationIds
      if (rawProps !== undefined) {
        return Array.isArray(rawProps) && rawProps.filter((p) => typeof p === 'string' && p.trim() !== '').length > 0
      }
      return true
    },
    { message: 'At least one property location is required', path: ['propertyIds'] },
  )

export const updateUserSchema = z
  .object({
    firstName: optionalNameField,
    first_name: optionalNameField,
    lastName: optionalNameField,
    last_name: optionalNameField,
    username: z
      .string()
      .optional()
      .refine((val) => !val || USERNAME_REGEX.test(val.trim()), {
        message: 'Username must be 3–30 characters and contain only letters, numbers, or underscore',
      }),
    email: z
      .string()
      .optional()
      .refine((val) => !val || EMAIL_REGEX.test(val.trim()), {
        message: 'Invalid email address format',
      }),
    phone: optionalPhoneField('Phone number must start with a digit between 6-9 and be exactly 10 digits'),
    password: z
      .string()
      .optional()
      .refine((val) => !val || val.length >= 6, {
        message: 'Password must be at least 6 characters long',
      }),
    emergencyContact: optionalPhoneField(
      'Emergency contact number must start with a digit between 6-9 and be exactly 10 digits',
    ),
    emergency_contact: optionalPhoneField(
      'Emergency contact number must start with a digit between 6-9 and be exactly 10 digits',
    ),
    roleCode: z.string().optional(),
    companyId: z.string().optional(),
    defaultLocationId: z.string().optional(),
    departmentId: z.string().optional(),
    jobCategoryId: z.string().optional(),
    dateOfJoining: optionalDateOfJoining,
    date_of_joining: optionalDateOfJoining,
    propertyIds: z.array(z.string()).optional(),
    property_ids: z.array(z.string()).optional(),
    properties: z.array(z.string()).optional(),
    locIds: z.array(z.string()).optional(),
    locationIds: z.array(z.string()).optional(),
    propertyId: z.string().nullable().optional(),
    property_id: z.string().nullable().optional(),
    property: z.string().nullable().optional(),
    locId: z.string().nullable().optional(),
    loc_id: z.string().nullable().optional(),
    locationId: z.string().nullable().optional(),
    location_id: z.string().nullable().optional(),
    managerId: z.string().nullable().optional(),
    manager_id: z.string().nullable().optional(),
    propertyManagers: z.record(z.string(), z.string().nullable().optional()).optional(),
    property_managers: z.record(z.string(), z.string().nullable().optional()).optional(),
    ...profileFields,
  })
  .passthrough()
  .refine(
    (data) => {
      const rawProps = data.propertyIds || data.property_ids || data.properties || data.locIds || data.locationIds
      if (rawProps !== undefined) {
        return Array.isArray(rawProps) && rawProps.filter((p) => typeof p === 'string' && p.trim() !== '').length > 0
      }
      return true
    },
    { message: 'At least one property location is required', path: ['propertyIds'] },
  )
  .refine(
    (data) => {
      const fName = data.firstName || data.first_name
      return !fName || NAME_REGEX.test(fName.trim())
    },
    { message: 'First name can only contain letters and spaces', path: ['firstName'] },
  )
  .refine(
    (data) => {
      const lName = data.lastName || data.last_name
      return !lName || NAME_REGEX.test(lName.trim())
    },
    { message: 'Last name can only contain letters and spaces', path: ['lastName'] },
  )

export const assignUserRoleSchema = z
  .object({
    roleId: z.string().optional(),
    roleCode: z.string().optional(),
    companyId: z.string().optional(),
    locationId: z.string().optional(),
    locId: z.string().optional(),
    departmentId: z.string().optional(),
    jobCategoryId: z.string().optional(),
  })
  .refine((data) => Boolean(data.roleId || data.roleCode), {
    message: 'Valid roleId or roleCode is required',
    path: ['roleCode'],
  })
