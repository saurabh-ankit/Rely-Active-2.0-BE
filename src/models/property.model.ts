import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { Package } from './package.model.js'
import type { CareTask } from './careTasks.model.js'
import type { PackageSubscription } from './packageSubscription.model.js'

export type PropertyType = 'apartment' | 'villa' | 'duplex' | 'triplex' | 'row_house' | 'plot' | 'commercial' | 'custom'
export type AreaUnit = 'sqft' | 'sqmt' | 'acres'

export interface PropertyAttributes extends BaseAttributes {
  companyId: string
  property_name: string
  description?: string | null
  // Address
  street?: string | null
  city: string
  state: string
  pincode: string
  country: string
  // Area
  total_area?: number | null
  area_unit?: AreaUnit | null
  // Meta
  amenities?: string[] | null
  /** Every kind of entity the property contains, e.g. ['apartment', 'villa']. */
  property_types?: PropertyType[] | null
  launch_date?: string | null
  isActive?: boolean
  isDeleted?: boolean
}

export type PropertyCreationAttributes = Optional<
  PropertyAttributes,
  | 'id'
  | 'description'
  | 'street'
  | 'total_area'
  | 'area_unit'
  | 'amenities'
  | 'property_types'
  | 'launch_date'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class Property extends BaseModel<PropertyAttributes, PropertyCreationAttributes> implements PropertyAttributes {
  declare companyId: string
  declare property_name: string
  declare description: string | null
  declare street: string | null
  declare city: string
  declare state: string
  declare pincode: string
  declare country: string
  declare total_area: number | null
  declare area_unit: AreaUnit | null
  declare amenities: string[] | null
  declare property_types: PropertyType[] | null
  declare launch_date: string | null
  declare isActive: boolean
  declare isDeleted: boolean

  declare packages?: Package[]
  declare careTasks?: CareTask[]
  declare packageSubscriptions?: PackageSubscription[]
}

Property.init(
  {
    ...baseModelColumns,
    companyId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK → company.id',
    },
    property_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Name of the property / project',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // ── Address ────────────────────────────────────────────────────────────────
    street: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    state: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    pincode: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    country: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'India',
    },
    // ── Area ──────────────────────────────────────────────────────────────────
    total_area: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    area_unit: {
      type: DataTypes.ENUM('sqft', 'sqmt', 'acres'),
      allowNull: true,
      defaultValue: 'sqft',
    },
    // ── Meta ──────────────────────────────────────────────────────────────────
    property_types: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    amenities: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    launch_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'properties',
    timestamps: true,
  },
)
