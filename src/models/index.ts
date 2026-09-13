import { InventoryCategory } from './inventoryCategory.model.js'
import { InventoryVendor } from './inventoryVendor.model.js'
import { InventoryItem } from './inventoryItem.model.js'
import { InventoryCategoryLocation } from './inventoryCategoryLocation.model.js'
import { InventoryVendorLocation } from './inventoryVendorLocation.model.js'
import { InventoryItemLocation } from './inventoryItemLocation.model.js'
import { InventoryItemVendor } from './inventoryItemVendor.model.js'
import { InventoryFieldDefinition } from './inventoryFieldDefinition.model.js'
import { InventoryFieldValue } from './inventoryFieldValue.model.js'
import { GuestMaster } from './guestMaster.model.js'
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
import { GatePreapproved } from './gatePreapproved.model.js'
import { GateEntry } from './gateEntry.model.js'
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
import { EventRequest } from './eventRequest.model.js'
import { EventGlobalService } from './eventGlobalService.model.js'
import { EventGlobalServiceProperty } from './eventGlobalServiceProperty.model.js'
import { Shift, ShiftV2 } from './shift.model.js'
import { ShiftAssignment, EmployeeShiftAssignmentV2 } from './shiftAssignment.model.js'
import { ShiftDate, ShiftEmployeeDate } from './shiftDate.model.js'
import { ShiftResidentPool } from './shiftResidentPool.model.js'
import { ShiftSetting, RosterSetting } from './shiftSetting.model.js'
import { ShiftRolePolicy, RosterRolePolicy } from './shiftRolePolicy.model.js'
import { ShiftArea, RosterArea } from './shiftArea.model.js'
import { FnbFoodAttendance } from './fnbFoodAttendance.model.js'
import {
  CareTask,
  type CareTaskAttributes,
  type CareTaskCreationAttributes,
  type BillingType,
} from './careTasks.model.js'
import {
  Package,
  type PackageAttributes,
  type PackageCreationAttributes,
  type PackageDuration,
  type PackageTaskItem,
} from './package.model.js'
import {
  PackageSubscription,
  type PackageSubscriptionAttributes,
  type PackageSubscriptionCreationAttributes,
  SubscriptionStatus,
} from './packageSubscription.model.js'
import {
  PackageSubscriptionFeature,
  type PackageSubscriptionFeatureAttributes,
  type PackageSubscriptionFeatureCreationAttributes,
} from './packageSubscriptionFeature.model.js'
import {
  AdditionalTaskCharge,
  type AdditionalTaskChargeAttributes,
  type AdditionalTaskChargeCreationAttributes,
} from './additionalTaskCharge.model.js'
import {
  CarePackageFeaturesMap,
  type CarePackageFeaturesMapAttributes,
  type CarePackageFeaturesMapCreationAttributes,
} from './carePackageFeaturesMap.model.js'
import {
  CareTaskAssignment,
  type CareTaskAssignmentAttributes,
  type CareTaskAssignmentCreationAttributes,
  type AssignmentSource,
  type AssignmentStatus,
} from './careTaskAssignment.model.js'
import {
  ResidentCareTaskCompletion,
  type ResidentCareTaskCompletionAttributes,
  type ResidentCareTaskCompletionCreationAttributes,
  type CompletionStatus,
} from './residentCareTaskCompletion.model.js'

// ── Billing & Revenue Management Module ──────────────────────────────────────
import { UnitResident } from './unitResident.model.js'
import { BillingProduct } from './billingProduct.model.js'
import { BillingPricePlan } from './billingPricePlan.model.js'
import { BillingAccount } from './billingAccount.model.js'
import { BillingParty } from './billingParty.model.js'
import { BillingContract } from './billingContract.model.js'
import { BillingSubscription } from './billingSubscription.model.js'
import { BillingEvent } from './billingEvent.model.js'
import { Invoice } from './invoice.model.js'
import { InvoiceLine } from './invoiceLine.model.js'
import { Payment } from './payment.model.js'
import { PaymentAllocation } from './paymentAllocation.model.js'
import { BillingRun } from './billingRun.model.js'
import { BillingLedgerEntry } from './billingLedgerEntry.model.js'
import {
  InventoryStock,
  InventoryPurchaseOrder,
  InventoryPurchaseOrderLine,
  InventoryStockTransaction,
  InventoryStockTransactionLine,
} from './inventoryStock.model.js'

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

Asset.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })
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
FnbResidentOrder.belongsTo(FnbGlobalMealSlot, { foreignKey: 'mealSlotId', as: 'globalMealSlot' })
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
FnbResidentOrder.belongsTo(User, { foreignKey: 'assignedEmployeeId', as: 'assignedEmployee' })
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

// ── Gate Management associations ───────────────────────────────────────────
Property.hasMany(GatePreapproved, { foreignKey: 'locId', as: 'gatePreapproveds' })
GatePreapproved.belongsTo(Property, { foreignKey: 'locId', as: 'property' })

PropertyUnit.hasMany(GatePreapproved, { foreignKey: 'unitId', as: 'gatePreapproveds' })
GatePreapproved.belongsTo(PropertyUnit, { foreignKey: 'unitId', as: 'unit' })

Resident.hasMany(GatePreapproved, { foreignKey: 'residentId', as: 'gatePreapproveds' })
GatePreapproved.belongsTo(Resident, { foreignKey: 'residentId', as: 'resident' })

Property.hasMany(GateEntry, { foreignKey: 'locId', as: 'gateEntries' })
GateEntry.belongsTo(Property, { foreignKey: 'locId', as: 'property' })

PropertyUnit.hasMany(GateEntry, { foreignKey: 'unitId', as: 'gateEntries' })
GateEntry.belongsTo(PropertyUnit, { foreignKey: 'unitId', as: 'unit' })

GatePreapproved.hasOne(GateEntry, { foreignKey: 'preapprovedId', as: 'entry' })
GateEntry.belongsTo(GatePreapproved, { foreignKey: 'preapprovedId', as: 'preapproved' })

GateEntry.belongsTo(User, { foreignKey: 'clockedInBy', as: 'clockedInByUser' })
GateEntry.belongsTo(User, { foreignKey: 'clockedOutBy', as: 'clockedOutByUser' })
GateEntry.belongsTo(User, { foreignKey: 'approvedBy', as: 'approvedByUser' })
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

// ── F&B Food Attendance Associations ───────────────────────────────────────
FnbFoodAttendance.belongsTo(Property, { foreignKey: 'locId', as: 'property' })
FnbFoodAttendance.belongsTo(PropertyUnit, { foreignKey: 'unitId', as: 'unit' })
FnbFoodAttendance.belongsTo(Resident, { foreignKey: 'residentId', as: 'resident' })
FnbFoodAttendance.belongsTo(ResidentFamilyMember, { foreignKey: 'familyMemberId', as: 'familyMember' })
FnbFoodAttendance.belongsTo(FnbPropertyMealSlot, { foreignKey: 'mealSlotId', as: 'mealSlot' })
FnbFoodAttendance.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' })

FnbPropertyMealSlot.hasMany(FnbFoodAttendance, { foreignKey: 'mealSlotId', as: 'foodAttendances' })
Resident.hasMany(FnbFoodAttendance, { foreignKey: 'residentId', as: 'foodAttendances' })
ResidentFamilyMember.hasMany(FnbFoodAttendance, { foreignKey: 'familyMemberId', as: 'foodAttendances' })

EventVenue.hasMany(EventRequest, { foreignKey: 'venueId', as: 'eventRequests' })
EventRequest.belongsTo(EventVenue, { foreignKey: 'venueId', as: 'venue' })

Resident.hasMany(EventRequest, { foreignKey: 'residentId', as: 'eventRequests' })
EventRequest.belongsTo(Resident, { foreignKey: 'residentId', as: 'resident' })

Property.hasMany(EventRequest, { foreignKey: 'locationId', as: 'eventRequests' })
EventRequest.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })

Event.hasMany(EventRequest, { foreignKey: 'confirmedEventId', as: 'confirmedFromRequests' })
EventRequest.belongsTo(Event, { foreignKey: 'confirmedEventId', as: 'confirmedEvent' })

// ── Shift & Roster associations ────────────────────────────────────────────
Property.hasMany(Shift, { foreignKey: 'locationId', as: 'shifts' })
Shift.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })

Shift.hasMany(ShiftAssignment, { foreignKey: 'shiftId', as: 'assignments' })
ShiftAssignment.belongsTo(Shift, { foreignKey: 'shiftId', as: 'shift' })
ShiftAssignment.belongsTo(User, { foreignKey: 'employeeId', as: 'employee' })
User.hasMany(ShiftAssignment, { foreignKey: 'employeeId', as: 'shiftAssignments' })
ShiftAssignment.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })
ShiftAssignment.belongsTo(ShiftArea, { foreignKey: 'areaId', as: 'area' })
ShiftAssignment.belongsTo(PropertyUnit, { foreignKey: 'unitId', as: 'unit' })
ShiftAssignment.belongsTo(PropertyBlock, { foreignKey: 'blockId', as: 'block' })
ShiftAssignment.belongsTo(PropertyFloor, { foreignKey: 'floorId', as: 'floor' })
PropertyUnit.hasMany(ShiftAssignment, { foreignKey: 'unitId', as: 'employeeShiftAssignments' })
PropertyBlock.hasMany(ShiftAssignment, { foreignKey: 'blockId', as: 'employeeShiftAssignments' })
PropertyFloor.hasMany(ShiftAssignment, { foreignKey: 'floorId', as: 'employeeShiftAssignments' })

ShiftAssignment.hasMany(ShiftDate, {
  foreignKey: 'employeeShiftAssignmentId',
  as: 'dates',
})
ShiftDate.belongsTo(ShiftAssignment, {
  foreignKey: 'employeeShiftAssignmentId',
  as: 'shiftAssignment',
})
ShiftDate.belongsTo(User, { foreignKey: 'coveredByEmployeeId', as: 'coveringEmployee' })
ShiftDate.belongsTo(User, { foreignKey: 'markedBy', as: 'markedByUser' })
ShiftDate.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })
ShiftDate.belongsTo(ShiftArea, { foreignKey: 'areaId', as: 'area' })

ShiftDate.hasMany(ShiftResidentPool, { foreignKey: 'shiftEmployeeDateId', as: 'residentPool' })
ShiftResidentPool.belongsTo(ShiftDate, {
  foreignKey: 'shiftEmployeeDateId',
  as: 'shiftEmployeeDate',
})
ShiftResidentPool.belongsTo(PropertyUnit, { foreignKey: 'unitId', as: 'unit' })
PropertyUnit.hasMany(ShiftResidentPool, { foreignKey: 'unitId', as: 'shiftResidentPools' })
ShiftResidentPool.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })

Property.hasMany(ShiftSetting, { foreignKey: 'locationId', as: 'shiftSettings' })
ShiftSetting.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })
Property.hasMany(ShiftRolePolicy, { foreignKey: 'locationId', as: 'shiftRolePolicies' })
ShiftRolePolicy.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })

Property.hasMany(ShiftArea, { foreignKey: 'locationId', as: 'shiftAreas' })
ShiftArea.belongsTo(Property, { foreignKey: 'locationId', as: 'property' })
// ── Billing Module Associations ────────────────────────────────────────────────
// "Start simple in implementation, but never simplistic in architecture."
// Golden Rule: Billing Account = Financial Folio. Decoupled from occupancy.

// ── UnitResident (Occupancy Bridge) ──────────────────────────────────────────
PropertyUnit.hasMany(UnitResident, { foreignKey: 'unitId', as: 'unitResidents' })
UnitResident.belongsTo(PropertyUnit, { foreignKey: 'unitId', as: 'unit' })

Resident.hasMany(UnitResident, { foreignKey: 'residentId', as: 'unitResidencies' })
UnitResident.belongsTo(Resident, { foreignKey: 'residentId', as: 'resident' })

// ── Billing Product & Price Plans ─────────────────────────────────────────────
Company.hasMany(BillingProduct, { foreignKey: 'companyId', as: 'billingProducts' })
BillingProduct.belongsTo(Company, { foreignKey: 'companyId', as: 'company' })

BillingProduct.hasMany(BillingPricePlan, { foreignKey: 'productId', as: 'pricePlans' })
BillingPricePlan.belongsTo(BillingProduct, { foreignKey: 'productId', as: 'product' })

Property.hasMany(BillingPricePlan, { foreignKey: 'propertyId', as: 'billingPricePlans' })
BillingPricePlan.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })

// ── Billing Account (Financial Folio) ─────────────────────────────────────────
PropertyUnit.hasMany(BillingAccount, { foreignKey: 'unitId', as: 'billingAccounts' })
BillingAccount.belongsTo(PropertyUnit, { foreignKey: 'unitId', as: 'unit' })

Property.hasMany(BillingAccount, { foreignKey: 'propertyId', as: 'billingAccounts' })
BillingAccount.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })

Company.hasMany(BillingAccount, { foreignKey: 'companyId', as: 'billingAccounts' })
BillingAccount.belongsTo(Company, { foreignKey: 'companyId', as: 'company' })

// primaryResidentId is informational (anchor) — NOT the payer
Resident.hasMany(BillingAccount, { foreignKey: 'primaryResidentId', as: 'primaryBillingAccounts' })
BillingAccount.belongsTo(Resident, { foreignKey: 'primaryResidentId', as: 'primaryResident' })

// ── Billing Parties (WHO PAYS) ────────────────────────────────────────────────
BillingAccount.hasMany(BillingParty, { foreignKey: 'billingAccountId', as: 'parties' })
BillingParty.belongsTo(BillingAccount, { foreignKey: 'billingAccountId', as: 'billingAccount' })

Resident.hasMany(BillingParty, { foreignKey: 'residentId', as: 'billingParties' })
BillingParty.belongsTo(Resident, { foreignKey: 'residentId', as: 'resident' })

ResidentFamilyMember.hasMany(BillingParty, { foreignKey: 'familyMemberId', as: 'billingParties' })
BillingParty.belongsTo(ResidentFamilyMember, { foreignKey: 'familyMemberId', as: 'familyMember' })

// ── Billing Contracts ─────────────────────────────────────────────────────────
BillingAccount.hasMany(BillingContract, { foreignKey: 'billingAccountId', as: 'contracts' })
BillingContract.belongsTo(BillingAccount, { foreignKey: 'billingAccountId', as: 'billingAccount' })

PropertyUnit.hasMany(BillingContract, { foreignKey: 'unitId', as: 'billingContracts' })
BillingContract.belongsTo(PropertyUnit, { foreignKey: 'unitId', as: 'unit' })

// ── Billing Subscriptions ─────────────────────────────────────────────────────
BillingAccount.hasMany(BillingSubscription, { foreignKey: 'billingAccountId', as: 'subscriptions' })
BillingSubscription.belongsTo(BillingAccount, { foreignKey: 'billingAccountId', as: 'billingAccount' })

BillingContract.hasMany(BillingSubscription, { foreignKey: 'contractId', as: 'subscriptions' })
BillingSubscription.belongsTo(BillingContract, { foreignKey: 'contractId', as: 'contract' })

BillingProduct.hasMany(BillingSubscription, { foreignKey: 'productId', as: 'subscriptions' })
BillingSubscription.belongsTo(BillingProduct, { foreignKey: 'productId', as: 'product' })

BillingPricePlan.hasMany(BillingSubscription, { foreignKey: 'pricePlanId', as: 'subscriptions' })
BillingSubscription.belongsTo(BillingPricePlan, { foreignKey: 'pricePlanId', as: 'pricePlan' })

PropertyUnit.hasMany(BillingSubscription, { foreignKey: 'unitId', as: 'billingSubscriptions' })
BillingSubscription.belongsTo(PropertyUnit, { foreignKey: 'unitId', as: 'unit' })

// FnB package bridge: food subscription links to fnb_resident_packages
FnbResidentPackage.hasOne(BillingSubscription, { foreignKey: 'fnbPackageId', as: 'billingSubscription' })
BillingSubscription.belongsTo(FnbResidentPackage, { foreignKey: 'fnbPackageId', as: 'fnbPackage' })

// ── Billing Events (IMMUTABLE Usage Facts) ────────────────────────────────────
BillingAccount.hasMany(BillingEvent, { foreignKey: 'billingAccountId', as: 'billingEvents' })
BillingEvent.belongsTo(BillingAccount, { foreignKey: 'billingAccountId', as: 'billingAccount' })

Resident.hasMany(BillingEvent, { foreignKey: 'residentId', as: 'billingEvents' })
BillingEvent.belongsTo(Resident, { foreignKey: 'residentId', as: 'resident' })

PropertyUnit.hasMany(BillingEvent, { foreignKey: 'unitId', as: 'billingEvents' })
BillingEvent.belongsTo(PropertyUnit, { foreignKey: 'unitId', as: 'unit' })

BillingProduct.hasMany(BillingEvent, { foreignKey: 'productId', as: 'billingEvents' })
BillingEvent.belongsTo(BillingProduct, { foreignKey: 'productId', as: 'product' })

// ── Invoices ──────────────────────────────────────────────────────────────────
BillingAccount.hasMany(Invoice, { foreignKey: 'billingAccountId', as: 'invoices' })
Invoice.belongsTo(BillingAccount, { foreignKey: 'billingAccountId', as: 'billingAccount' })

PropertyUnit.hasMany(Invoice, { foreignKey: 'unitId', as: 'invoices' })
Invoice.belongsTo(PropertyUnit, { foreignKey: 'unitId', as: 'unit' })

Resident.hasMany(Invoice, { foreignKey: 'residentId', as: 'invoices' })
Invoice.belongsTo(Resident, { foreignKey: 'residentId', as: 'resident' })

// Self-referential for credit/debit notes
Invoice.belongsTo(Invoice, { foreignKey: 'referenceInvoiceId', as: 'referenceInvoice' })
Invoice.hasMany(Invoice, { foreignKey: 'referenceInvoiceId', as: 'relatedNotes' })

// ── Invoice Lines ─────────────────────────────────────────────────────────────
Invoice.hasMany(InvoiceLine, { foreignKey: 'invoiceId', as: 'lines' })
InvoiceLine.belongsTo(Invoice, { foreignKey: 'invoiceId', as: 'invoice' })

BillingSubscription.hasMany(InvoiceLine, { foreignKey: 'subscriptionId', as: 'invoiceLines' })
InvoiceLine.belongsTo(BillingSubscription, { foreignKey: 'subscriptionId', as: 'subscription' })

BillingEvent.hasMany(InvoiceLine, { foreignKey: 'billingEventId', as: 'invoiceLines' })
InvoiceLine.belongsTo(BillingEvent, { foreignKey: 'billingEventId', as: 'billingEvent' })

BillingProduct.hasMany(InvoiceLine, { foreignKey: 'productId', as: 'invoiceLines' })
InvoiceLine.belongsTo(BillingProduct, { foreignKey: 'productId', as: 'product' })

// consumedByResidentId = WHO used the service (not who pays)
Resident.hasMany(InvoiceLine, { foreignKey: 'consumedByResidentId', as: 'consumedInvoiceLines' })
InvoiceLine.belongsTo(Resident, { foreignKey: 'consumedByResidentId', as: 'consumedByResident' })

// ── Payments ──────────────────────────────────────────────────────────────────
BillingAccount.hasMany(Payment, { foreignKey: 'billingAccountId', as: 'payments' })
Payment.belongsTo(BillingAccount, { foreignKey: 'billingAccountId', as: 'billingAccount' })

// ── Payment Allocations ───────────────────────────────────────────────────────
Payment.hasMany(PaymentAllocation, { foreignKey: 'paymentId', as: 'allocations' })
PaymentAllocation.belongsTo(Payment, { foreignKey: 'paymentId', as: 'payment' })

Invoice.hasMany(PaymentAllocation, { foreignKey: 'invoiceId', as: 'paymentAllocations' })
PaymentAllocation.belongsTo(Invoice, { foreignKey: 'invoiceId', as: 'invoice' })

BillingAccount.hasMany(PaymentAllocation, { foreignKey: 'billingAccountId', as: 'paymentAllocations' })
PaymentAllocation.belongsTo(BillingAccount, { foreignKey: 'billingAccountId', as: 'billingAccount' })

// ── Billing Runs ──────────────────────────────────────────────────────────────
Property.hasMany(BillingRun, { foreignKey: 'propertyId', as: 'billingRuns' })
BillingRun.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })

// ── Billing Ledger Entries (SACRED APPEND-ONLY) ───────────────────────────────
BillingAccount.hasMany(BillingLedgerEntry, { foreignKey: 'billingAccountId', as: 'ledgerEntries' })
BillingLedgerEntry.belongsTo(BillingAccount, { foreignKey: 'billingAccountId', as: 'billingAccount' })

PropertyUnit.hasMany(BillingLedgerEntry, { foreignKey: 'unitId', as: 'ledgerEntries' })
BillingLedgerEntry.belongsTo(PropertyUnit, { foreignKey: 'unitId', as: 'unit' })

// ── Care Tasks associations ──────────────────────────────────────────────────
Property.hasMany(CareTask, { foreignKey: 'propertyId', as: 'careTasks' })
CareTask.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })

// ── Packages associations ────────────────────────────────────────────────────
Property.hasMany(Package, { foreignKey: 'propertyId', as: 'packages' })
Package.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })

// ── Care Package Features Map associations ──────────────────────────────────
Package.belongsToMany(CareTask, {
  through: CarePackageFeaturesMap,
  as: 'features',
  foreignKey: 'carePackageId',
  otherKey: 'featureId',
})
CareTask.belongsToMany(Package, {
  through: CarePackageFeaturesMap,
  as: 'packages',
  foreignKey: 'featureId',
  otherKey: 'carePackageId',
})

Package.hasMany(CarePackageFeaturesMap, {
  foreignKey: 'carePackageId',
  as: 'featureMaps',
})
Package.hasMany(CarePackageFeaturesMap, {
  foreignKey: 'carePackageId',
  as: 'featureMappings',
})
CarePackageFeaturesMap.belongsTo(Package, {
  foreignKey: 'carePackageId',
  as: 'carePackage',
})

CareTask.hasMany(CarePackageFeaturesMap, {
  foreignKey: 'featureId',
  as: 'packageMaps',
})
CarePackageFeaturesMap.belongsTo(CareTask, {
  foreignKey: 'featureId',
  as: 'feature',
})

// ── Package Subscription associations ─────────────────────────────────────────
Resident.belongsTo(Package, { foreignKey: 'carePackageId', as: 'carePackage' })
Package.hasMany(Resident, { foreignKey: 'carePackageId', as: 'residents' })

Resident.hasMany(PackageSubscription, { foreignKey: 'residentId', as: 'packageSubscriptions' })
PackageSubscription.belongsTo(Resident, { foreignKey: 'residentId', as: 'resident' })

Package.hasMany(PackageSubscription, { foreignKey: 'carePackageId', as: 'packageSubscriptions' })
PackageSubscription.belongsTo(Package, { foreignKey: 'carePackageId', as: 'carePackage' })

Property.hasMany(PackageSubscription, { foreignKey: 'propertyId', as: 'packageSubscriptions' })
PackageSubscription.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })

PackageSubscription.hasMany(PackageSubscriptionFeature, {
  foreignKey: 'packageSubscriptionId',
  as: 'packageSubscriptionFeatures',
})
PackageSubscription.hasMany(PackageSubscriptionFeature, {
  foreignKey: 'packageSubscriptionId',
  as: 'features',
})
PackageSubscriptionFeature.belongsTo(PackageSubscription, {
  foreignKey: 'packageSubscriptionId',
  as: 'subscription',
})

CareTask.hasMany(PackageSubscriptionFeature, {
  foreignKey: 'featureId',
  as: 'packageSubscriptionFeatures',
})
PackageSubscriptionFeature.belongsTo(CareTask, {
  foreignKey: 'featureId',
  as: 'feature',
})

// ── Additional Task Charges associations ──────────────────────────────────────
Resident.hasMany(AdditionalTaskCharge, { foreignKey: 'residentId', as: 'additionalTaskCharges' })
AdditionalTaskCharge.belongsTo(Resident, { foreignKey: 'residentId', as: 'resident' })

CareTask.hasMany(AdditionalTaskCharge, { foreignKey: 'featureId', as: 'additionalTaskCharges' })
AdditionalTaskCharge.belongsTo(CareTask, { foreignKey: 'featureId', as: 'feature' })

User.hasMany(AdditionalTaskCharge, { foreignKey: 'nurseId', as: 'nurseAdditionalTaskCharges' })
AdditionalTaskCharge.belongsTo(User, { foreignKey: 'nurseId', as: 'nurse' })

// ── Care Task Assignments associations ─────────────────────────────────────────
Resident.hasMany(CareTaskAssignment, { foreignKey: 'residentId', as: 'careTaskAssignments' })
CareTaskAssignment.belongsTo(Resident, { foreignKey: 'residentId', as: 'resident' })

CareTask.hasMany(CareTaskAssignment, { foreignKey: 'taskId', as: 'assignments' })
CareTaskAssignment.belongsTo(CareTask, { foreignKey: 'taskId', as: 'task' })

Property.hasMany(CareTaskAssignment, { foreignKey: 'propertyId', as: 'careTaskAssignments' })
CareTaskAssignment.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })

User.hasMany(CareTaskAssignment, { foreignKey: 'nurseId', as: 'assignedCareTasks' })
CareTaskAssignment.belongsTo(User, { foreignKey: 'nurseId', as: 'nurse' })

User.hasMany(CareTaskAssignment, { foreignKey: 'completedBy', as: 'completedCareTasks' })
CareTaskAssignment.belongsTo(User, { foreignKey: 'completedBy', as: 'completedByUser' })

User.hasMany(CareTaskAssignment, { foreignKey: 'stoppedBy', as: 'stoppedCareTasks' })
CareTaskAssignment.belongsTo(User, { foreignKey: 'stoppedBy', as: 'stoppedByUser' })

CareTaskAssignment.hasMany(AdditionalTaskCharge, { foreignKey: 'taskAssignmentId', as: 'charges' })
AdditionalTaskCharge.belongsTo(CareTaskAssignment, { foreignKey: 'taskAssignmentId', as: 'taskAssignment' })

PackageSubscription.hasMany(CareTaskAssignment, { foreignKey: 'packageSubscriptionId', as: 'careTaskAssignments' })
CareTaskAssignment.belongsTo(PackageSubscription, { foreignKey: 'packageSubscriptionId', as: 'packageSubscription' })

Package.hasMany(CareTaskAssignment, { foreignKey: 'carePackageId', as: 'careTaskAssignments' })
CareTaskAssignment.belongsTo(Package, { foreignKey: 'carePackageId', as: 'carePackage' })

// ── Resident Care Task Completion associations ─────────────────────────────────
CareTaskAssignment.hasMany(ResidentCareTaskCompletion, {
  foreignKey: 'residentCareTaskAssignmentId',
  as: 'completions',
})
ResidentCareTaskCompletion.belongsTo(CareTaskAssignment, {
  foreignKey: 'residentCareTaskAssignmentId',
  as: 'assignment',
})

Resident.hasMany(ResidentCareTaskCompletion, { foreignKey: 'residentId', as: 'careTaskCompletions' })
ResidentCareTaskCompletion.belongsTo(Resident, { foreignKey: 'residentId', as: 'resident' })

CareTask.hasMany(ResidentCareTaskCompletion, { foreignKey: 'taskId', as: 'completions' })
ResidentCareTaskCompletion.belongsTo(CareTask, { foreignKey: 'taskId', as: 'task' })

Property.hasMany(ResidentCareTaskCompletion, { foreignKey: 'propertyId', as: 'careTaskCompletions' })
ResidentCareTaskCompletion.belongsTo(Property, { foreignKey: 'propertyId', as: 'property' })

User.hasMany(ResidentCareTaskCompletion, { foreignKey: 'completedBy', as: 'completedCareTaskRecords' })
ResidentCareTaskCompletion.belongsTo(User, { foreignKey: 'completedBy', as: 'completedByUser' })

// ── Inventory Stock Transactions & Billing ─────────────────────────────────────
InventoryStockTransaction.hasMany(InventoryStockTransactionLine, {
  foreignKey: 'transactionId',
  as: 'lines',
})
InventoryStockTransactionLine.belongsTo(InventoryStockTransaction, {
  foreignKey: 'transactionId',
  as: 'transaction',
})

Resident.hasMany(InventoryStockTransaction, {
  foreignKey: 'residentId',
  as: 'inventoryTransactions',
})
InventoryStockTransaction.belongsTo(Resident, {
  foreignKey: 'residentId',
  as: 'resident',
})

export {
  GuestMaster,
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
  GatePreapproved,
  GateEntry,
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
  EventRequest,
  EventGlobalService,
  EventGlobalServiceProperty,
  Shift,
  ShiftV2,
  ShiftAssignment,
  EmployeeShiftAssignmentV2,
  ShiftDate,
  ShiftEmployeeDate,
  ShiftResidentPool,
  ShiftSetting,
  RosterSetting,
  ShiftRolePolicy,
  RosterRolePolicy,
  ShiftArea,
  RosterArea,
  FnbFoodAttendance,
  // ── Billing & Revenue Management Module ───────────────────────────────────
  UnitResident,
  BillingProduct,
  BillingPricePlan,
  BillingAccount,
  BillingParty,
  BillingContract,
  BillingSubscription,
  BillingEvent,
  Invoice,
  InvoiceLine,
  Payment,
  PaymentAllocation,
  BillingRun,
  BillingLedgerEntry,
  // ── Care Tasks & Medical Module ───────────────────────────────────────────
  CareTask,
  type CareTaskAttributes,
  type CareTaskCreationAttributes,
  type BillingType,
  Package,
  type PackageAttributes,
  type PackageCreationAttributes,
  type PackageDuration,
  type PackageTaskItem,
  PackageSubscription,
  type PackageSubscriptionAttributes,
  type PackageSubscriptionCreationAttributes,
  SubscriptionStatus,
  PackageSubscriptionFeature,
  type PackageSubscriptionFeatureAttributes,
  type PackageSubscriptionFeatureCreationAttributes,
  AdditionalTaskCharge,
  type AdditionalTaskChargeAttributes,
  type AdditionalTaskChargeCreationAttributes,
  CarePackageFeaturesMap,
  type CarePackageFeaturesMapAttributes,
  type CarePackageFeaturesMapCreationAttributes,
  CareTaskAssignment,
  type CareTaskAssignmentAttributes,
  type CareTaskAssignmentCreationAttributes,
  type AssignmentSource,
  type AssignmentStatus,
  ResidentCareTaskCompletion,
  type ResidentCareTaskCompletionAttributes,
  type ResidentCareTaskCompletionCreationAttributes,
  type CompletionStatus,
}

InventoryItem.belongsTo(InventoryCategory, { foreignKey: 'categoryId', as: 'category' })
InventoryCategoryLocation.belongsTo(InventoryCategory, { foreignKey: 'categoryId', as: 'category' })
InventoryCategoryLocation.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })
InventoryVendorLocation.belongsTo(InventoryVendor, { foreignKey: 'vendorId', as: 'vendor' })
InventoryVendorLocation.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })
InventoryItemLocation.belongsTo(InventoryItem, { foreignKey: 'itemId', as: 'item' })
InventoryItemLocation.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })
InventoryItemVendor.belongsTo(InventoryItem, { foreignKey: 'itemId', as: 'item' })
InventoryItemVendor.belongsTo(InventoryVendor, { foreignKey: 'vendorId', as: 'vendor' })
InventoryItemVendor.belongsTo(Property, { foreignKey: 'locationId', as: 'location' })
InventoryFieldDefinition.belongsTo(InventoryCategory, { foreignKey: 'categoryId', as: 'category' })
InventoryFieldValue.belongsTo(InventoryItem, { foreignKey: 'itemId', as: 'item' })
InventoryFieldValue.belongsTo(InventoryFieldDefinition, { foreignKey: 'fieldDefinitionId', as: 'definition' })
export {
  InventoryCategory,
  InventoryVendor,
  InventoryItem,
  InventoryCategoryLocation,
  InventoryVendorLocation,
  InventoryItemLocation,
  InventoryItemVendor,
  InventoryFieldDefinition,
  InventoryFieldValue,
}

export {
  InventoryStock,
  InventoryPurchaseOrder,
  InventoryPurchaseOrderLine,
  InventoryStockTransaction,
  InventoryStockTransactionLine,
}
