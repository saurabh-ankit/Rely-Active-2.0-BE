import { z } from 'zod'
import { EMAIL_REGEX, PHONE_REGEX } from './company.validation.js'

export const createUserSchema = z
  .object({
    firstName: z.string().optional(),
    first_name: z.string().optional(),
    lastName: z.string().optional(),
    last_name: z.string().optional(),
    username: z.string().optional(),
    email: z
      .string()
      .optional()
      .refine((val) => !val || EMAIL_REGEX.test(val.trim()), {
        message: 'Invalid email address format',
      }),
    phone: z
      .string()
      .optional()
      .refine((val) => !val || PHONE_REGEX.test(val.trim()), {
        message: 'Phone number must start with a digit between 6-9 and be exactly 10 digits',
      }),
    password: z
      .string()
      .optional()
      .refine((val) => !val || val.length >= 6, {
        message: 'Password must be at least 6 characters long',
      }),
    emergencyContact: z
      .string()
      .optional()
      .refine((val) => !val || PHONE_REGEX.test(val.trim()), {
        message: 'Emergency contact number must start with a digit between 6-9 and be exactly 10 digits',
      }),
    emergency_contact: z
      .string()
      .optional()
      .refine((val) => !val || PHONE_REGEX.test(val.trim()), {
        message: 'Emergency contact number must start with a digit between 6-9 and be exactly 10 digits',
      }),
    roleCode: z.string().optional(),
    companyId: z.string().optional(),
    defaultLocationId: z.string().optional(),
    departmentId: z.string().optional(),
    jobCategoryId: z.string().optional(),
    dateOfJoining: z.string().optional(),
    date_of_joining: z.string().optional(),
    propertyIds: z.array(z.string()).optional(),
    property_ids: z.array(z.string()).optional(),
    properties: z.array(z.string()).optional(),
    locIds: z.array(z.string()).optional(),
    locationIds: z.array(z.string()).optional(),
  })
  .refine(
    (data) => {
      const fName = data.firstName || data.first_name
      return Boolean(fName && fName.trim().length > 0)
    },
    { message: 'First name is required', path: ['firstName'] },
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
    firstName: z.string().optional(),
    first_name: z.string().optional(),
    lastName: z.string().optional(),
    last_name: z.string().optional(),
    username: z.string().optional(),
    email: z
      .string()
      .optional()
      .refine((val) => !val || EMAIL_REGEX.test(val.trim()), {
        message: 'Invalid email address format',
      }),
    phone: z
      .string()
      .optional()
      .refine((val) => !val || PHONE_REGEX.test(val.trim()), {
        message: 'Phone number must start with a digit between 6-9 and be exactly 10 digits',
      }),
    password: z
      .string()
      .optional()
      .refine((val) => !val || val.length >= 6, {
        message: 'Password must be at least 6 characters long',
      }),
    emergencyContact: z
      .string()
      .optional()
      .refine((val) => !val || PHONE_REGEX.test(val.trim()), {
        message: 'Emergency contact number must start with a digit between 6-9 and be exactly 10 digits',
      }),
    emergency_contact: z
      .string()
      .optional()
      .refine((val) => !val || PHONE_REGEX.test(val.trim()), {
        message: 'Emergency contact number must start with a digit between 6-9 and be exactly 10 digits',
      }),
    roleCode: z.string().optional(),
    companyId: z.string().optional(),
    defaultLocationId: z.string().optional(),
    departmentId: z.string().optional(),
    jobCategoryId: z.string().optional(),
    dateOfJoining: z.string().optional(),
    date_of_joining: z.string().optional(),
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
