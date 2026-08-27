import { Company } from './company.model.js'
import { CompanyCustomField } from './companyCustomField.model.js'
import { Property } from './property.model.js'
import { PropertyBlock } from './propertyBlock.model.js'
import { PropertyFloor } from './propertyFloor.model.js'
import { PropertyUnit } from './propertyUnit.model.js'
import { User } from './user.model.js'
import { UserProfile } from './userProfile.model.js'
import { Department } from './department.model.js'
import { JobCategory } from './jobCategory.model.js'
import { Role } from './role.model.js'
import { Module } from './module.model.js'
import { Permission } from './permission.model.js'
import { UserRole } from './userRole.model.js'
import { RolePermission } from './rolePermission.model.js'
import { UserPermission } from './userPermission.model.js'
import { UserProperty } from './userProperty.model.js'
import { Resource } from './resource.model.js'
import { UserLocation } from './userLocation.model.js'
import { UserLocationPermission } from './userLocationPermission.model.js'

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

// ── User & Profile ──────────────────────────────────────────────────────────
User.hasOne(UserProfile, { foreignKey: 'user_id', as: 'profile' })
UserProfile.belongsTo(User, { foreignKey: 'user_id', as: 'user' })

// ── Department & JobCategory ────────────────────────────────────────────────
Department.hasMany(JobCategory, { foreignKey: 'department_id', as: 'jobCategories' })
JobCategory.belongsTo(Department, { foreignKey: 'department_id', as: 'department' })

// ── Module & Submodule ──────────────────────────────────────────────────────
Module.hasMany(Module, { foreignKey: 'parent_id', as: 'subModules' })
Module.belongsTo(Module, { foreignKey: 'parent_id', as: 'parentModule' })

Module.hasMany(Permission, { foreignKey: 'module_id', as: 'permissions' })
Permission.belongsTo(Module, { foreignKey: 'module_id', as: 'module' })

// ── User <-> UserRole <-> Role ──────────────────────────────────────────────
User.hasMany(UserRole, { foreignKey: 'user_id', as: 'userRoles' })
UserRole.belongsTo(User, { foreignKey: 'user_id', as: 'user' })

Role.hasMany(UserRole, { foreignKey: 'role_id', as: 'userRoles' })
UserRole.belongsTo(Role, { foreignKey: 'role_id', as: 'role' })

User.belongsToMany(Role, { through: UserRole, foreignKey: 'user_id', otherKey: 'role_id', as: 'roles' })
Role.belongsToMany(User, { through: UserRole, foreignKey: 'role_id', otherKey: 'user_id', as: 'users' })

// ── Role <-> RolePermission <-> Permission ─────────────────────────────────
Role.hasMany(RolePermission, { foreignKey: 'role_id', as: 'rolePermissions' })
RolePermission.belongsTo(Role, { foreignKey: 'role_id', as: 'role' })

Permission.hasMany(RolePermission, { foreignKey: 'permission_id', as: 'permissionRoles' })
RolePermission.belongsTo(Permission, { foreignKey: 'permission_id', as: 'permission' })

Role.belongsToMany(Permission, {
  through: RolePermission,
  foreignKey: 'role_id',
  otherKey: 'permission_id',
  as: 'permissions',
})
Permission.belongsToMany(Role, {
  through: RolePermission,
  foreignKey: 'permission_id',
  otherKey: 'role_id',
  as: 'roles',
})

// ── User <-> UserPermission (UBAC) ──────────────────────────────────────────
User.hasMany(UserPermission, { foreignKey: 'user_id', as: 'userPermissions' })
UserPermission.belongsTo(User, { foreignKey: 'user_id', as: 'user' })

Permission.hasMany(UserPermission, { foreignKey: 'permission_id', as: 'userPermissions' })
UserPermission.belongsTo(Permission, { foreignKey: 'permission_id', as: 'permission' })

// ── User <-> UserProperty <-> Property ──────────────────────────────────────
User.hasMany(UserProperty, { foreignKey: 'user_id', as: 'userProperties' })
UserProperty.belongsTo(User, { foreignKey: 'user_id', as: 'user' })

Property.hasMany(UserProperty, { foreignKey: 'property_id', as: 'userProperties' })
UserProperty.belongsTo(Property, { foreignKey: 'property_id', as: 'property' })

User.belongsToMany(Property, {
  through: UserProperty,
  foreignKey: 'user_id',
  otherKey: 'property_id',
  as: 'assignedProperties',
})
Property.belongsToMany(User, {
  through: UserProperty,
  foreignKey: 'property_id',
  otherKey: 'user_id',
  as: 'assignedUsers',
})

export {
  Company,
  CompanyCustomField,
  Property,
  PropertyBlock,
  PropertyFloor,
  PropertyUnit,
  User,
  UserProfile,
  Department,
  JobCategory,
  Role,
  Module,
  Permission,
  UserRole,
  RolePermission,
  UserPermission,
  UserProperty,
  Resource,
  UserLocation,
  UserLocationPermission,
}
