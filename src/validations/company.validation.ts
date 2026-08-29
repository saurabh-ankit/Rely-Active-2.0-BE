import { z } from 'zod'

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const PHONE_REGEX = /^[6-9][0-9]{9}$/
export const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/

export const createCompanySchema = z
  .object({
    company_name: z.string().min(1, 'Company name is required'),
    email: z.string().optional(),
    email_id: z.string().optional(),
    contact_number: z
      .string()
      .regex(PHONE_REGEX, 'Contact number must start with a digit between 6-9 and be exactly 10 digits'),
    alternate_contact_number: z
      .string()
      .optional()
      .refine((val) => !val || PHONE_REGEX.test(val), {
        message: 'Alternate contact number must start with a digit between 6-9 and be exactly 10 digits',
      }),
    head_office_address: z.string().optional(),
    company_head_office_address: z.string().optional(),
    gst_number: z
      .string()
      .optional()
      .refine((val) => !val || GST_REGEX.test(val.toUpperCase()), {
        message: 'Invalid GST number format (e.g. 22AAAAA0000A1Z5)',
      }),
    company_gst_number: z
      .string()
      .optional()
      .refine((val) => !val || GST_REGEX.test(val.toUpperCase()), {
        message: 'Invalid GST number format (e.g. 22AAAAA0000A1Z5)',
      }),
    ifsc_code: z
      .string()
      .optional()
      .refine((val) => !val || IFSC_REGEX.test(val.toUpperCase()), {
        message: 'Invalid IFSC code format (e.g. SBIN0001234)',
      }),
  })
  .passthrough()

export const updateCompanySchema = createCompanySchema.partial().passthrough()

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
  ifsc_code?: string
}

export const validateCompanyCreateInput = (data: CompanyInputData): string | null => {
  const companyName = String(data.company_name || '').trim()
  const email = String(data.email || data.email_id || '').trim()
  const contact = String(data.contact_number || '').trim()
  const address = String(data.head_office_address || data.company_head_office_address || '').trim()
  const altContact = String(data.alternate_contact_number || '').trim()
  const gst = String(data.gst_number || data.company_gst_number || '').trim()
  const ifsc = String(data.ifsc_code || '').trim()

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

  if (gst && !GST_REGEX.test(gst.toUpperCase())) {
    return 'Invalid GST number format (e.g. 22AAAAA0000A1Z5)'
  }

  if (ifsc && !IFSC_REGEX.test(ifsc.toUpperCase())) {
    return 'Invalid IFSC code format (e.g. SBIN0001234)'
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

  const checkGst = String(updates.gst_number || updates.company_gst_number || '').trim()
  if (checkGst && !GST_REGEX.test(checkGst.toUpperCase())) {
    return 'Invalid GST number format (e.g. 22AAAAA0000A1Z5)'
  }

  const checkIfsc = String(updates.ifsc_code || '').trim()
  if (checkIfsc && !IFSC_REGEX.test(checkIfsc.toUpperCase())) {
    return 'Invalid IFSC code format (e.g. SBIN0001234)'
  }

  return null
}
