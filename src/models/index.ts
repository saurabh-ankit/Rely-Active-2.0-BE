import { Company } from './company.model.js'
import { CompanyCustomField } from './companyCustomField.model.js'

Company.hasMany(CompanyCustomField, {
  foreignKey: 'companyId',
  as: 'customFields',
})

CompanyCustomField.belongsTo(Company, {
  foreignKey: 'companyId',
  as: 'company',
})

export { Company, CompanyCustomField }
