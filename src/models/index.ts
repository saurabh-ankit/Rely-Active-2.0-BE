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
import { TicketCategory } from './ticketCategory.model.js'
import { TicketSubCategory } from './ticketSubCategory.model.js'
import { Ticket } from './ticket.model.js'
import { TicketActivityLog } from './ticketActivityLog.model.js'
import { FnbGlobalMealSlot } from './fnbGlobalMealSlot.model.js'
import { FnbPropertyMealSlot } from './fnbPropertyMealSlot.model.js'
import { FnbGlobalSpecialSlot } from './fnbGlobalSpecialSlot.model.js'
import { FnbPropertySpecialSlot } from './fnbPropertySpecialSlot.model.js'
import { FnbPropertySpecialSlotDish } from './fnbPropertySpecialSlotDish.model.js'
import { FnbResidentOrderDetail } from './fnbResidentOrderDetail.model.js'
import { FnbFoodDelivery } from './fnbFoodDelivery.model.js'
import { EventVenue } from './eventVenue.model.js'
import { Event } from './event.model.js'
import { EventRegistration } from './eventRegistration.model.js'
import { EventGlobalService } from './eventGlobalService.model.js'
import { EventGlobalServiceProperty } from './eventGlobalServiceProperty.model.js'

// ── F&B Meal Slot associations ──────────────────────────────────────────────
FnbGlobalMealSlot.hasMany(FnbPropertyMealSlot, { foreignKey: 'globalMealSlotId', as: 'propertyMealSlots' })
FnbPropertyMealSlot.belongsTo(FnbGlobalMealSlot, { foreignKey: 'globalMealSlotId', as: 'globalMealSlot' })

Property.hasMany(FnbPropertyMealSlot, { foreignKey: 'locId', as: 'propertyMealSlots' })
FnbPropertyMealSlot.belongsTo(Property, { foreignKey: 'locId', as: 'property' })

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

Asset.belongsTo(Property, { foreignKey: 'locationId', as: 'property' })
Property.hasMany(Asset, { foreignKey: 'locationId', as: 'propertyAssets' })

Asset.belongsTo(AssetVendor, { foreignKey: 'vendorId', as: 'vendor' })
AssetVendor.hasMany(Asset, { foreignKey: 'vendorId', as: 'vendorAssets' })

Asset.hasMany(AssetAssignment, { foreignKey: 'assetId', as: 'assignments' })
AssetAssignment.belongsTo(Asset, { foreignKey: 'assetId', as: 'asset' })
AssetAssignment.belongsTo(User, { foreignKey: 'assignedToUserId', as: 'assignedToUser' })
AssetAssignment.belongsTo(Resident, { foreignKey: 'assignedToResidentId', as: 'assignedToResident' })
AssetAssignment.belongsTo(Department, { foreignKey: 'assignedToDeptId', as: 'assignedToDept' })
AssetAssignment.belongsTo(PropertyUnit, { foreignKey: 'assignedToUnitId', as: 'assignedToUnit' })

Asset.hasMany(AssetServiceLog, { foreignKey: 'assetId', as: 'serviceLogs' })
AssetServiceLog.belongsTo(Asset, { foreignKey: 'assetId', as: 'asset' })
AssetServiceLog.belongsTo(AssetVendor, { foreignKey: 'vendorId', as: 'vendor' })
AssetServiceLog.belongsTo(User, { foreignKey: 'performedByUserId', as: 'performedByUser' })

Asset.hasMany(AssetWarranty, { foreignKey: 'assetId', as: 'warranties' })
AssetWarranty.belongsTo(Asset, { foreignKey: 'assetId', as: 'asset' })
AssetWarranty.belongsTo(AssetVendor, { foreignKey: 'providerVendorId', as: 'providerVendor' })

Asset.hasMany(AssetCalibration, { foreignKey: 'assetId', as: 'calibrations' })
AssetCalibration.belongsTo(Asset, { foreignKey: 'assetId', as: 'asset' })
AssetCalibration.belongsTo(AssetVendor, { foreignKey: 'agencyVendorId', as: 'agencyVendor' })

Asset.hasMany(AssetComplianceInspection, { foreignKey: 'assetId', as: 'complianceInspections' })
AssetComplianceInspection.belongsTo(Asset, { foreignKey: 'assetId', as: 'asset' })
AssetComplianceInspection.belongsTo(AssetVendor, { foreignKey: 'agencyVendorId', as: 'agencyVendor' })
AssetComplianceInspection.belongsTo(User, { foreignKey: 'inspectorUserId', as: 'inspectorUser' })

Asset.hasMany(AssetComplianceCertification, { foreignKey: 'assetId', as: 'complianceCertifications' })
AssetComplianceCertification.belongsTo(Asset, { foreignKey: 'assetId', as: 'asset' })
AssetComplianceCertification.belongsTo(AssetVendor, { foreignKey: 'agencyVendorId', as: 'agencyVendor' })

Asset.hasMany(AssetComplianceTraining, { foreignKey: 'assetId', as: 'complianceTrainings' })
AssetComplianceTraining.belongsTo(Asset, { foreignKey: 'assetId', as: 'asset' })
AssetComplianceTraining.belongsTo(User, { foreignKey: 'trainerUserId', as: 'trainerUser' })

// ── F&B Package & Order associations ─────────────────────────────────────
FnbPropertyPackage.belongsTo(FnbGlobalPackage, { foreignKey: 'globalPackageId', as: 'globalPackage' })
FnbPropertyPackage.belongsTo(Property, { foreignKey: 'locId', as: 'property' })
FnbGlobalPackage.hasMany(FnbPropertyPackage, { foreignKey: 'globalPackageId', as: 'propertyPackages' })

FnbGlobalSpecialSlot.hasMany(FnbPropertySpecialSlot, { foreignKey: 'globalSpecialSlotId', as: 'propertySpecialSlots' })
FnbPropertySpecialSlot.belongsTo(FnbGlobalSpecialSlot, { foreignKey: 'globalSpecialSlotId', as: 'globalSpecialSlot' })
FnbPropertySpecialSlot.belongsTo(Property, { foreignKey: 'locId', as: 'property' })
Property.hasMany(FnbPropertySpecialSlot, { foreignKey: 'locId', as: 'propertySpecialSlots' })

FnbPropertySpecialSlot.hasMany(FnbPropertySpecialSlotDish, { foreignKey: 'propertySpecialSlotId', as: 'specialDishes' })
FnbPropertySpecialSlotDish.belongsTo(FnbPropertySpecialSlot, {
  foreignKey: 'propertySpecialSlotId',
  as: 'propertySpecialSlot',
})
FnbPropertySpecialSlotDish.belongsTo(FnbDish, { foreignKey: 'dishId', as: 'dish' })

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
FnbResidentOrder.belongsTo(ResidentFamilyMember, { foreignKey: 'familyMemberId', as: 'familyMember' })
FnbResidentOrder.belongsTo(FnbResidentPackage, { foreignKey: 'residentPackageId', as: 'residentPackage' })
FnbResidentOrder.belongsTo(FnbPropertySpecialSlot, { foreignKey: 'specialMealSlotId', as: 'specialMealSlot' })
FnbResidentOrder.hasMany(FnbResidentOrderDetail, { foreignKey: 'orderId', as: 'details' })

FnbResidentOrderDetail.belongsTo(FnbResidentOrder, { foreignKey: 'orderId', as: 'order' })
FnbResidentOrderDetail.belongsTo(FnbDish, { foreignKey: 'dishId', as: 'dish' })
FnbResidentOrderDetail.belongsTo(FnbGlobalMealSlot, { foreignKey: 'mealSlotId', as: 'globalMealSlot' })
FnbResidentOrderDetail.belongsTo(FnbPropertySpecialSlot, { foreignKey: 'specialMealSlotId', as: 'specialMealSlot' })
FnbResidentOrderDetail.belongsTo(FnbPropertySpecialSlotDish, {
  foreignKey: 'specialMealSlotDishId',
  as: 'specialMealSlotDish',
})

FnbResidentOrder.hasOne(FnbFoodDelivery, { foreignKey: 'orderId', as: 'delivery' })
FnbFoodDelivery.belongsTo(FnbResidentOrder, { foreignKey: 'orderId', as: 'order' })
FnbFoodDelivery.belongsTo(User, { foreignKey: 'employeeId', as: 'employee' })
FnbFoodDelivery.belongsTo(UserDetail, { foreignKey: 'employeeId', targetKey: 'userId', as: 'employeeDetail' })

// ── Ticket Management associations ─────────────────────────────────────────
TicketCategory.hasMany(TicketSubCategory, { foreignKey: 'categoryId', as: 'subCategories' })
TicketSubCategory.belongsTo(TicketCategory, { foreignKey: 'categoryId', as: 'category' })

Property.hasMany(Ticket, { foreignKey: 'locId', as: 'tickets' })
Ticket.belongsTo(Property, { foreignKey: 'locId', as: 'property' })

PropertyUnit.hasMany(Ticket, { foreignKey: 'unitId', as: 'tickets' })
Ticket.belongsTo(PropertyUnit, { foreignKey: 'unitId', as: 'unit' })

Resident.hasMany(Ticket, { foreignKey: 'residentId', as: 'tickets' })
Ticket.belongsTo(Resident, { foreignKey: 'residentId', as: 'resident' })

ResidentFamilyMember.hasMany(Ticket, { foreignKey: 'familyMemberId', as: 'tickets' })
Ticket.belongsTo(ResidentFamilyMember, { foreignKey: 'familyMemberId', as: 'familyMember' })

User.hasMany(Ticket, { foreignKey: 'raisedByUserId', as: 'raisedTickets' })
Ticket.belongsTo(User, { foreignKey: 'raisedByUserId', as: 'raisedByUser' })

User.hasMany(Ticket, { foreignKey: 'assignedToUserId', as: 'assignedTickets' })
Ticket.belongsTo(User, { foreignKey: 'assignedToUserId', as: 'assignedToUser' })

User.hasMany(Ticket, { foreignKey: 'approvedByUserId', as: 'approvedTickets' })
Ticket.belongsTo(User, { foreignKey: 'approvedByUserId', as: 'approvedByUser' })

Department.hasMany(Ticket, { foreignKey: 'departmentId', as: 'tickets' })
Ticket.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' })

JobCategory.hasMany(Ticket, { foreignKey: 'jobCategoryId', as: 'tickets' })
Ticket.belongsTo(JobCategory, { foreignKey: 'jobCategoryId', as: 'jobCategory' })

TicketCategory.hasMany(Ticket, { foreignKey: 'categoryId', as: 'tickets' })
Ticket.belongsTo(TicketCategory, { foreignKey: 'categoryId', as: 'categoryObj' })

TicketSubCategory.hasMany(Ticket, { foreignKey: 'subCategoryId', as: 'tickets' })
Ticket.belongsTo(TicketSubCategory, { foreignKey: 'subCategoryId', as: 'subCategoryObj' })

AssetVendor.hasMany(Ticket, { foreignKey: 'vendorId', as: 'tickets' })
Ticket.belongsTo(AssetVendor, { foreignKey: 'vendorId', as: 'vendor' })

Asset.hasMany(Ticket, { foreignKey: 'assetId', as: 'tickets' })
Ticket.belongsTo(Asset, { foreignKey: 'assetId', as: 'asset' })

Ticket.hasMany(TicketActivityLog, { foreignKey: 'ticketId', as: 'activityLogs' })
TicketActivityLog.belongsTo(Ticket, { foreignKey: 'ticketId', as: 'ticket' })
TicketActivityLog.belongsTo(User, { foreignKey: 'performedByUserId', as: 'performedByUser' })

// ── Global Services associations ───────────────────────────────────────────
EventGlobalService.hasMany(EventGlobalServiceProperty, { foreignKey: 'globalServiceId', as: 'propertyServices' })
EventGlobalServiceProperty.belongsTo(EventGlobalService, { foreignKey: 'globalServiceId', as: 'globalService' })
EventGlobalServiceProperty.belongsTo(Property, { foreignKey: 'locId', as: 'property' })

// ── Events Management associations ─────────────────────────────────────────
Property.hasMany(EventVenue, { foreignKey: 'locationId', as: 'venues' })
EventVenue.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })

EventVenue.hasMany(Event, { foreignKey: 'venueId', as: 'events' })
Event.belongsTo(EventVenue, { foreignKey: 'venueId', as: 'venue' })

Property.hasMany(Event, { foreignKey: 'locationId', as: 'events' })
Event.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })

Event.hasMany(EventRegistration, { foreignKey: 'eventId', as: 'registrations' })
EventRegistration.belongsTo(Event, { foreignKey: 'eventId', as: 'event' })

Resident.hasMany(EventRegistration, { foreignKey: 'residentId', as: 'eventRegistrations' })
EventRegistration.belongsTo(Resident, { foreignKey: 'residentId', as: 'resident' })

Property.hasMany(EventRegistration, { foreignKey: 'locationId', as: 'eventRegistrations' })
EventRegistration.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })

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
  TicketCategory,
  TicketSubCategory,
  Ticket,
  TicketActivityLog,
  FnbResidentOrderDetail,
  FnbFoodDelivery,
  FnbGlobalMealSlot,
  FnbPropertyMealSlot,
  FnbGlobalSpecialSlot,
  FnbPropertySpecialSlot,
  FnbPropertySpecialSlotDish,
  EventVenue,
  Event,
  EventRegistration,
  EventGlobalService,
  EventGlobalServiceProperty,
}
