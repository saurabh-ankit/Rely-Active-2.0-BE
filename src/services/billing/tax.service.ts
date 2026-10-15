import { Company, CompanyCustomField } from '../../models/index.js'

export interface TaxConfig {
  gstEnabled: boolean
  /** Total GST %, split equally into CGST and SGST (intra-state supply). */
  rate: number
  cgstRate: number
  sgstRate: number
  gstNumber: string
}

/** GST settings from Global Settings → Tax (company custom fields; 18% when never saved). */
export async function getTaxConfig(): Promise<TaxConfig & { cgstStored: number; sgstStored: number }> {
  const company = await Company.findOne({ where: { isDeleted: false } })
  let gstEnabled = true
  let rate = 18
  let cgstStored = 9
  let sgstStored = 9
  if (company) {
    const fields = await CompanyCustomField.findAll({ where: { companyId: company.id, isDeleted: false } })
    for (const cf of fields) {
      if (cf.fieldName === 'gst_enabled') gstEnabled = cf.fieldValue !== 'false'
      if (cf.fieldName === 'gst_rate') rate = Number(cf.fieldValue) || 18
      if (cf.fieldName === 'cgst_rate') cgstStored = Number(cf.fieldValue) || 9
      if (cf.fieldName === 'sgst_rate') sgstStored = Number(cf.fieldValue) || 9
    }
  }
  return {
    gstEnabled,
    rate,
    cgstRate: rate / 2,
    sgstRate: rate / 2,
    gstNumber: company?.company_gst_number || '',
    cgstStored,
    sgstStored,
  }
}
