import { Company } from './company.model.js'
import { CompanyCustomField } from './companyCustomField.model.js'
import { Property } from './property.model.js'
import { PropertyBlock } from './propertyBlock.model.js'
import { PropertyFloor } from './propertyFloor.model.js'
import { PropertyUnit } from './propertyUnit.model.js'

// ── Company associations ────────────────────────────────────────────────────
Company.hasMany(CompanyCustomField, {
  foreignKey: 'companyId',
  as: 'customFields',
})

CompanyCustomField.belongsTo(Company, {
  foreignKey: 'companyId',
  as: 'company',
})

// ── Property associations ───────────────────────────────────────────────────
Company.hasMany(Property, {
  foreignKey: 'companyId',
  as: 'properties',
})

Property.belongsTo(Company, {
  foreignKey: 'companyId',
  as: 'company',
})

// ── Property → Block ────────────────────────────────────────────────────────
Property.hasMany(PropertyBlock, {
  foreignKey: 'propertyId',
  as: 'blocks',
})

PropertyBlock.belongsTo(Property, {
  foreignKey: 'propertyId',
  as: 'property',
})

// ── Block → Floor ────────────────────────────────────────────────────────────
PropertyBlock.hasMany(PropertyFloor, {
  foreignKey: 'blockId',
  as: 'floors',
})

PropertyFloor.belongsTo(PropertyBlock, {
  foreignKey: 'blockId',
  as: 'block',
})

// ── Floor → Unit ─────────────────────────────────────────────────────────────
PropertyFloor.hasMany(PropertyUnit, {
  foreignKey: 'floorId',
  as: 'units',
})

PropertyUnit.belongsTo(PropertyFloor, {
  foreignKey: 'floorId',
  as: 'floor',
})

export { Company, CompanyCustomField, Property, PropertyBlock, PropertyFloor, PropertyUnit }
