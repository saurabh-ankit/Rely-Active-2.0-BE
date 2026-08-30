import { BaseModel, baseModelColumns, type BaseAttributes, type BaseCreationAttributes } from './base.model.js'
import { Company } from './company.model.js'
import { CompanyCustomField } from './companyCustomField.model.js'
import { Property } from './property.model.js'
import { PropertyBlock } from './propertyBlock.model.js'
import { PropertyFloor } from './propertyFloor.model.js'
import { PropertyUnit } from './propertyUnit.model.js'
import { User } from './user.model.js'
import { UserDetail } from './userDetail.model.js'
import { Department } from './department.model.js'
import { JobCategory } from './jobCategory.model.js'
import { Role } from './role.model.js'
import { UserLocation } from './userLocation.model.js'
import { Resource } from './resource.model.js'
import { UserLocationPermission } from './userLocationPermission.model.js'
import { EmployeeManager } from './employeeManager.model.js'
import { AssetCategory } from './assetCategory.model.js'
import { AssetCategoryLocation } from './assetCategoryLocation.model.js'
import { AssetVendor } from './assetVendor.model.js'
import { AssetVendorCustomField } from './assetVendorCustomField.model.js'
import { AssetVendorLocation } from './assetVendorLocation.model.js'
import { AssetItem } from './assetItem.model.js'
import { AssetItemLocation } from './assetItemLocation.model.js'
import { Asset } from './asset.model.js'
import { AssetAssignment } from './assetAssignment.model.js'
import { AssetServiceLog } from './assetServiceLog.model.js'
import { AssetWarranty } from './assetWarranty.model.js'
import { AssetCalibration } from './assetCalibration.model.js'
import { AssetComplianceInspection } from './assetComplianceInspection.model.js'
import { AssetComplianceCertification } from './assetComplianceCertification.model.js'
import { AssetComplianceTraining } from './assetComplianceTraining.model.js'

// ── Company associations ────────────────────────────────────────────────────
Company.hasMany(CompanyCustomField, { foreignKey: 'companyId', as: 'customFields' })
CompanyCustomField.belongsTo(Company, { foreignKey: 'companyId', as: 'company' })

Company.hasMany(Property, { foreignKey: 'companyId', as: 'properties' })
Property.belongsTo(Company, { foreignKey: 'companyId', as: 'company' })

// ── Property → Block → Floor → Unit ─────────────────────────────────────────
Property.hasMany(PropertyBlock, { foreignKey: 'propertyId', as: 'blocks' })
PropertyBlock.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })

PropertyBlock.hasMany(PropertyFloor, { foreignKey: 'blockId', as: 'floors' })
PropertyFloor.belongsTo(PropertyBlock, { foreignKey: 'blockId', as: 'block' })

PropertyFloor.hasMany(PropertyUnit, { foreignKey: 'floorId', as: 'units' })
PropertyUnit.belongsTo(PropertyFloor, { foreignKey: 'floorId', as: 'floor' })

// ── User & Detail ───────────────────────────────────────────────────────────
User.hasOne(UserDetail, { foreignKey: 'userId', as: 'profile' })
UserDetail.belongsTo(User, { foreignKey: 'userId', as: 'user' })

// ── Department & JobCategory ────────────────────────────────────────────────
Department.hasMany(JobCategory, { foreignKey: 'departmentId', as: 'jobCategories' })
JobCategory.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' })

// ── User <-> UserLocation <-> Property / Role ───────────────────────────────
User.hasMany(UserLocation, { foreignKey: 'userId', as: 'userLocations' })
UserLocation.belongsTo(User, { foreignKey: 'userId', as: 'user' })

Property.hasMany(UserLocation, { foreignKey: 'locId', as: 'userLocations' })
UserLocation.belongsTo(Property, { foreignKey: 'locId', as: 'property' })

Role.hasMany(UserLocation, { foreignKey: 'roleId', as: 'userLocations' })
UserLocation.belongsTo(Role, { foreignKey: 'roleId', as: 'role' })

Company.hasMany(UserLocation, { foreignKey: 'companyId', as: 'userLocations' })
UserLocation.belongsTo(Company, { foreignKey: 'companyId', as: 'company' })

Department.hasMany(UserLocation, { foreignKey: 'departmentId', as: 'userLocations' })
UserLocation.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' })

JobCategory.hasMany(UserLocation, { foreignKey: 'jobCategoryId', as: 'userLocations' })
UserLocation.belongsTo(JobCategory, { foreignKey: 'jobCategoryId', as: 'jobCategory' })

User.belongsToMany(Role, { through: UserLocation, foreignKey: 'userId', otherKey: 'roleId', as: 'roles' })
Role.belongsToMany(User, { through: UserLocation, foreignKey: 'roleId', otherKey: 'userId', as: 'users' })

User.belongsToMany(Property, {
  through: UserLocation,
  foreignKey: 'userId',
  otherKey: 'locId',
  as: 'assignedProperties',
})
Property.belongsToMany(User, {
  through: UserLocation,
  foreignKey: 'locId',
  otherKey: 'userId',
  as: 'assignedUsers',
})

// ── EmployeeManager associations ───────────────────────────────────────────
User.hasMany(EmployeeManager, { foreignKey: 'userId', as: 'employeeManagers' })
EmployeeManager.belongsTo(User, { foreignKey: 'userId', as: 'employee' })
EmployeeManager.belongsTo(User, { foreignKey: 'managerId', as: 'manager' })
EmployeeManager.belongsTo(Property, { foreignKey: 'locId', as: 'property' })

// ── Asset Management associations ──────────────────────────────────────────
AssetCategory.hasMany(AssetCategoryLocation, { foreignKey: 'categoryId', as: 'categoryLocations' })
AssetCategoryLocation.belongsTo(AssetCategory, { foreignKey: 'categoryId', as: 'category' })
AssetCategoryLocation.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })
AssetCategory.belongsToMany(Property, {
  through: AssetCategoryLocation,
  foreignKey: 'categoryId',
  otherKey: 'locationId',
  as: 'locations',
})

AssetCategory.hasMany(AssetItem, { foreignKey: 'categoryId', as: 'items' })
AssetItem.belongsTo(AssetCategory, { foreignKey: 'categoryId', as: 'category' })

AssetVendor.belongsTo(AssetCategory, { foreignKey: 'categoryId', as: 'category' })
AssetCategory.hasMany(AssetVendor, { foreignKey: 'categoryId', as: 'vendors' })

AssetVendor.hasMany(AssetVendorCustomField, { foreignKey: 'vendorId', as: 'customFields' })
AssetVendorCustomField.belongsTo(AssetVendor, { foreignKey: 'vendorId', as: 'vendor' })

AssetVendor.hasMany(AssetVendorLocation, { foreignKey: 'vendorId', as: 'vendorLocations' })
AssetVendorLocation.belongsTo(AssetVendor, { foreignKey: 'vendorId', as: 'vendor' })
AssetVendorLocation.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })
AssetVendor.belongsToMany(Property, {
  through: AssetVendorLocation,
  foreignKey: 'vendorId',
  otherKey: 'locationId',
  as: 'locations',
})

AssetItem.belongsTo(AssetVendor, { foreignKey: 'vendorId', as: 'vendor' })
AssetVendor.hasMany(AssetItem, { foreignKey: 'vendorId', as: 'items' })

AssetItem.hasMany(AssetItemLocation, { foreignKey: 'itemId', as: 'itemLocations' })
AssetItemLocation.belongsTo(AssetItem, { foreignKey: 'itemId', as: 'item' })
AssetItemLocation.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })
AssetItem.belongsToMany(Property, {
  through: AssetItemLocation,
  foreignKey: 'itemId',
  otherKey: 'locationId',
  as: 'locations',
})

AssetItem.hasMany(Asset, { foreignKey: 'itemId', as: 'assets' })
Asset.belongsTo(AssetItem, { foreignKey: 'itemId', as: 'item' })

Asset.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })
Asset.belongsTo(AssetVendor, { foreignKey: 'vendorId', as: 'vendor' })
Asset.hasMany(AssetAssignment, { foreignKey: 'assetId', as: 'assignments' })
Asset.hasMany(AssetServiceLog, { foreignKey: 'assetId', as: 'serviceLogs' })
Asset.hasMany(AssetWarranty, { foreignKey: 'assetId', as: 'warranties' })
Asset.hasMany(AssetCalibration, { foreignKey: 'assetId', as: 'calibrations' })
Asset.hasMany(AssetComplianceInspection, { foreignKey: 'assetId', as: 'inspections' })
Asset.hasMany(AssetComplianceCertification, { foreignKey: 'assetId', as: 'certifications' })
Asset.hasMany(AssetComplianceTraining, { foreignKey: 'assetId', as: 'trainings' })

AssetAssignment.belongsTo(Asset, { foreignKey: 'assetId', as: 'asset' })
AssetAssignment.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })
AssetAssignment.belongsTo(User, { foreignKey: 'assignedBy', as: 'assigner' })

AssetServiceLog.belongsTo(Asset, { foreignKey: 'assetId', as: 'asset' })
AssetServiceLog.belongsTo(AssetVendor, { foreignKey: 'vendorId', as: 'vendor' })

AssetWarranty.belongsTo(Asset, { foreignKey: 'assetId', as: 'asset' })
AssetWarranty.belongsTo(AssetVendor, { foreignKey: 'vendorId', as: 'vendor' })

AssetCalibration.belongsTo(Asset, { foreignKey: 'assetId', as: 'asset' })

AssetComplianceInspection.belongsTo(Asset, { foreignKey: 'assetId', as: 'asset' })

AssetComplianceCertification.belongsTo(Asset, { foreignKey: 'assetId', as: 'asset' })

AssetComplianceTraining.belongsTo(Asset, { foreignKey: 'assetId', as: 'asset' })

export {
  BaseModel,
  baseModelColumns,
  type BaseAttributes,
  type BaseCreationAttributes,
  Company,
  CompanyCustomField,
  Property,
  PropertyBlock,
  PropertyFloor,
  PropertyUnit,
  User,
  UserDetail,
  Department,
  JobCategory,
  Role,
  UserLocation,
  Resource,
  UserLocationPermission,
  EmployeeManager,
  AssetCategory,
  AssetCategoryLocation,
  AssetVendor,
  AssetVendorCustomField,
  AssetVendorLocation,
  AssetItem,
  AssetItemLocation,
  Asset,
  AssetAssignment,
  AssetServiceLog,
  AssetWarranty,
  AssetCalibration,
  AssetComplianceInspection,
  AssetComplianceCertification,
  AssetComplianceTraining,
}
