import { Company } from '../models/index.js'

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export async function resolveCompanyId(rawCompanyId?: string | null, userCompanyId?: string | null): Promise<string> {
  if (rawCompanyId && UUID_REGEX.test(rawCompanyId)) {
    return rawCompanyId
  }

  if (userCompanyId && UUID_REGEX.test(userCompanyId)) {
    return userCompanyId
  }

  const existingCompany = await Company.findOne({ where: { isDeleted: false } })
  if (existingCompany) {
    return existingCompany.id
  }

  const newCompany = await Company.create({
    company_name: 'Primary Care Facility',
    email_id: 'admin@rely.com',
    contact_number: '9876543210',
    company_head_office_address: 'Headquarters',
  })

  return newCompany.id
}
