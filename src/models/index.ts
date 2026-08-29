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
}
