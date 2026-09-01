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
import { Resident } from './resident.model.js'
import { ResidentFamilyMember } from './residentFamilyMember.model.js'
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
import { FnbGlobalPackage } from './fnbGlobalPackage.model.js'
import { FnbPropertyPackage } from './fnbPropertyPackage.model.js'
import { FnbResidentPackage } from './fnbResidentPackage.model.js'
import { FnbDish } from './fnbDish.model.js'
import { FnbPropertyDish } from './fnbPropertyDish.model.js'
import { FnbMenu } from './fnbMenu.model.js'
import { FnbMenuItem } from './fnbMenuItem.model.js'
import { FnbResidentOrder } from './fnbResidentOrder.model.js'

// ── Roster & Scheduling Imports ──────────────────────────────────────────────
import { RosterDoctorProfile } from './rosterDoctorProfile.model.js'
import { SchedulingResource } from './schedulingResource.model.js'
import { RosterDoctorLocation } from './rosterDoctorLocation.model.js'
import { RosterDoctorEngagement } from './rosterDoctorEngagement.model.js'
import { RosterShift } from './rosterShift.model.js'
import { RosterFrequency } from './rosterFrequency.model.js'
import { RosterAssignment } from './rosterAssignment.model.js'
import { RosterAssignmentTarget } from './rosterAssignmentTarget.model.js'
import { RosterAssignmentDate } from './rosterAssignmentDate.model.js'
import { RosterReplacement } from './rosterReplacement.model.js'
import { RosterSetting } from './rosterSetting.model.js'
import { RosterAuditLog } from './rosterAuditLog.model.js'
import { MedicalSpecialization } from './medicalSpecialization.model.js'


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

// ── Resident associations ───────────────────────────────────────────────────
PropertyUnit.hasMany(Resident, { foreignKey: 'unitId', as: 'residents' })
Resident.belongsTo(PropertyUnit, { foreignKey: 'unitId', as: 'unit' })

Property.hasMany(Resident, { foreignKey: 'locId', as: 'residents' })
Resident.belongsTo(Property, { foreignKey: 'locId', as: 'property' })

Resident.hasMany(ResidentFamilyMember, { foreignKey: 'residentId', as: 'familyMembers' })
ResidentFamilyMember.belongsTo(Resident, { foreignKey: 'residentId', as: 'resident' })

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
AssetAssignment.belongsTo(User, { foreignKey: 'assigneeId', constraints: false, as: 'employeeAssignee' })
AssetAssignment.belongsTo(Resident, { foreignKey: 'assigneeId', constraints: false, as: 'residentAssignee' })
AssetAssignment.belongsTo(PropertyUnit, { foreignKey: 'assigneeId', constraints: false, as: 'flatAssignee' })

AssetServiceLog.belongsTo(Asset, { foreignKey: 'assetId', as: 'asset' })
AssetServiceLog.belongsTo(AssetVendor, { foreignKey: 'vendorId', as: 'vendor' })

AssetWarranty.belongsTo(Asset, { foreignKey: 'assetId', as: 'asset' })
AssetWarranty.belongsTo(AssetVendor, { foreignKey: 'vendorId', as: 'vendor' })

AssetCalibration.belongsTo(Asset, { foreignKey: 'assetId', as: 'asset' })

AssetComplianceInspection.belongsTo(Asset, { foreignKey: 'assetId', as: 'asset' })

AssetComplianceCertification.belongsTo(Asset, { foreignKey: 'assetId', as: 'asset' })

AssetComplianceTraining.belongsTo(Asset, { foreignKey: 'assetId', as: 'asset' })

// ── F&B associations ───────────────────────────────────────────────────
FnbGlobalPackage.hasMany(FnbPropertyPackage, { foreignKey: 'globalPackageId', as: 'propertyPackages' })
FnbPropertyPackage.belongsTo(FnbGlobalPackage, { foreignKey: 'globalPackageId', as: 'globalPackage' })
FnbPropertyPackage.belongsTo(Property, { foreignKey: 'locId', as: 'property' })

FnbResidentPackage.belongsTo(Resident, { foreignKey: 'residentId', as: 'resident' })
FnbResidentPackage.belongsTo(ResidentFamilyMember, { foreignKey: 'familyMemberId', as: 'familyMember' })
FnbResidentPackage.belongsTo(FnbPropertyPackage, { foreignKey: 'propertyPackageId', as: 'propertyPackage' })
Resident.hasMany(FnbResidentPackage, { foreignKey: 'residentId', as: 'fnbPackages' })
ResidentFamilyMember.hasMany(FnbResidentPackage, { foreignKey: 'familyMemberId', as: 'fnbPackages' })

FnbPropertyDish.belongsTo(FnbDish, { foreignKey: 'dishId', as: 'dish' })
FnbPropertyDish.belongsTo(Property, { foreignKey: 'locId', as: 'property' })
FnbDish.hasMany(FnbPropertyDish, { foreignKey: 'dishId', as: 'propertyDishes' })

FnbMenu.belongsTo(Property, { foreignKey: 'locId', as: 'property' })
FnbMenu.hasMany(FnbMenuItem, { foreignKey: 'menuId', as: 'menuItems' })
FnbMenuItem.belongsTo(FnbMenu, { foreignKey: 'menuId', as: 'menu' })
FnbMenuItem.belongsTo(FnbDish, { foreignKey: 'dishId', as: 'dish' })

FnbResidentOrder.belongsTo(Resident, { foreignKey: 'residentId', as: 'resident' })
FnbResidentOrder.belongsTo(FnbDish, { foreignKey: 'dishId', as: 'dish' })
FnbResidentOrder.belongsTo(FnbMenuItem, { foreignKey: 'menuItemId', as: 'menuItem' })
FnbResidentOrder.belongsTo(FnbResidentPackage, { foreignKey: 'residentPackageId', as: 'residentPackage' })

// ── Roster & Scheduling associations ─────────────────────────────────────────
RosterDoctorProfile.belongsTo(User, { foreignKey: 'userId', as: 'user' })
User.hasOne(RosterDoctorProfile, { foreignKey: 'userId', as: 'doctorProfile' })

SchedulingResource.belongsTo(Company, { foreignKey: 'companyId', as: 'company' })
SchedulingResource.belongsTo(User, { foreignKey: 'userId', as: 'user' })
SchedulingResource.belongsTo(RosterDoctorProfile, { foreignKey: 'doctorProfileId', as: 'doctorProfile' })
RosterDoctorProfile.hasMany(SchedulingResource, { foreignKey: 'doctorProfileId', as: 'resources' })

RosterDoctorLocation.belongsTo(RosterDoctorProfile, { foreignKey: 'doctorProfileId', as: 'doctorProfile' })
RosterDoctorLocation.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })
RosterDoctorProfile.hasMany(RosterDoctorLocation, { foreignKey: 'doctorProfileId', as: 'allowedLocations' })

RosterDoctorEngagement.belongsTo(RosterDoctorProfile, { foreignKey: 'doctorProfileId', as: 'doctorProfile' })
RosterDoctorEngagement.belongsTo(Company, { foreignKey: 'companyId', as: 'company' })
RosterDoctorEngagement.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })
RosterDoctorEngagement.belongsTo(PropertyUnit, { foreignKey: 'clinicRoomId', as: 'clinicRoom' })
RosterDoctorProfile.hasMany(RosterDoctorEngagement, { foreignKey: 'doctorProfileId', as: 'engagements' })

RosterShift.belongsTo(Company, { foreignKey: 'companyId', as: 'company' })
RosterShift.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })

RosterFrequency.belongsTo(Company, { foreignKey: 'companyId', as: 'company' })
RosterFrequency.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })

RosterAssignment.belongsTo(Company, { foreignKey: 'companyId', as: 'company' })
RosterAssignment.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })
RosterAssignment.belongsTo(SchedulingResource, { foreignKey: 'schedulingResourceId', as: 'resource' })
RosterAssignment.belongsTo(RosterShift, { foreignKey: 'shiftId', as: 'shift' })
RosterAssignment.belongsTo(RosterFrequency, { foreignKey: 'frequencyId', as: 'frequency' })
RosterAssignment.hasMany(RosterAssignmentTarget, { foreignKey: 'rosterAssignmentId', as: 'targets' })
RosterAssignment.hasMany(RosterAssignmentDate, { foreignKey: 'rosterAssignmentId', as: 'dateInstances' })

RosterAssignmentTarget.belongsTo(RosterAssignment, { foreignKey: 'rosterAssignmentId', as: 'assignment' })

RosterAssignmentDate.belongsTo(Company, { foreignKey: 'companyId', as: 'company' })
RosterAssignmentDate.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })
RosterAssignmentDate.belongsTo(RosterAssignment, { foreignKey: 'rosterAssignmentId', as: 'assignment' })
RosterAssignmentDate.belongsTo(SchedulingResource, { foreignKey: 'schedulingResourceId', as: 'resource' })
RosterAssignmentDate.belongsTo(SchedulingResource, { foreignKey: 'coveredByResourceId', as: 'coveredByResource' })
RosterAssignmentDate.belongsTo(RosterShift, { foreignKey: 'shiftId', as: 'shift' })
RosterAssignmentDate.hasMany(RosterReplacement, { foreignKey: 'rosterAssignmentDateId', as: 'replacements' })

RosterReplacement.belongsTo(RosterAssignmentDate, { foreignKey: 'rosterAssignmentDateId', as: 'dateInstance' })
RosterReplacement.belongsTo(SchedulingResource, { foreignKey: 'originalResourceId', as: 'originalResource' })
RosterReplacement.belongsTo(SchedulingResource, { foreignKey: 'replacementResourceId', as: 'replacementResource' })

RosterSetting.belongsTo(Company, { foreignKey: 'companyId', as: 'company' })
RosterSetting.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })

RosterAuditLog.belongsTo(Company, { foreignKey: 'companyId', as: 'company' })
RosterAuditLog.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })

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
  Resident,
  ResidentFamilyMember,
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
  FnbGlobalPackage,
  FnbPropertyPackage,
  FnbResidentPackage,
  FnbDish,
  FnbPropertyDish,
  FnbMenu,
  FnbMenuItem,
  FnbResidentOrder,
  RosterDoctorProfile,
  SchedulingResource,
  RosterDoctorLocation,
  RosterDoctorEngagement,
  RosterShift,
  RosterFrequency,
  RosterAssignment,
  RosterAssignmentTarget,
  RosterAssignmentDate,
  RosterReplacement,
  RosterSetting,
  RosterAuditLog,
  MedicalSpecialization,
}


