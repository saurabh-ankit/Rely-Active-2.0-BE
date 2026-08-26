import { z } from 'zod'

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const PHONE_REGEX = /^[6-9][0-9]{9}$/

export const createCompanySchema = z.object({
  company_name: z.string().min(1, 'Company name is required'),
  email: z.string().regex(EMAIL_REGEX, 'Invalid email address format'),
  contact_number: z
    .string()
    .regex(PHONE_REGEX, 'Contact number must start with a digit between 6-9 and be exactly 10 digits'),
  alternate_contact_number: z
    .string()
    .optional()
    .refine((val) => !val || PHONE_REGEX.test(val), {
      message: 'Alternate contact number must start with a digit between 6-9 and be exactly 10 digits',
    }),
  head_office_address: z.string().min(1, 'Head office address is required'),
})

export interface CompanyInputData {
  company_name?: string
  gst_number?: string
  company_gst_number?: string
  email?: string
  email_id?: string
  contact_number?: string
  alternate_contact_number?: string
  head_office_address?: string
  company_head_office_address?: string
}

export const validateCompanyCreateInput = (data: CompanyInputData): string | null => {
  const companyName = String(data.company_name || '').trim()
  const email = String(data.email || data.email_id || '').trim()
  const contact = String(data.contact_number || '').trim()
  const address = String(data.head_office_address || data.company_head_office_address || '').trim()
  const altContact = String(data.alternate_contact_number || '').trim()

  if (!companyName || !email || !contact || !address) {
    return 'company_name, email, contact_number, and head_office_address are required'
  }

  if (!EMAIL_REGEX.test(email)) {
    return 'Invalid email address format'
  }

  if (!PHONE_REGEX.test(contact)) {
    return 'Contact number must start with a digit between 6-9 and be exactly 10 digits'
  }

  if (altContact && !PHONE_REGEX.test(altContact)) {
    return 'Alternate contact number must start with a digit between 6-9 and be exactly 10 digits'
  }

  return null
}

export const validateCompanyUpdateInput = (
  updates: Record<string, unknown>,
  existing: { email_id: string; contact_number: string },
): string | null => {
  const checkEmail = String(updates.email_id || updates.email || existing.email_id || '').trim()
  if (checkEmail && !EMAIL_REGEX.test(checkEmail)) {
    return 'Invalid email address format'
  }

  const checkContact = String(updates.contact_number || existing.contact_number || '').trim()
  if (checkContact && !PHONE_REGEX.test(checkContact)) {
    return 'Contact number must start with a digit between 6-9 and be exactly 10 digits'
  }

  const checkAltContact = String(updates.alternate_contact_number || '').trim()
  if (checkAltContact && !PHONE_REGEX.test(checkAltContact)) {
    return 'Alternate contact number must start with a digit between 6-9 and be exactly 10 digits'
  }

  return null
}
