import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'

export type PropertyType = 'apartment' | 'villa' | 'duplex' | 'triplex'
export type AreaUnit = 'sqft' | 'sqmt' | 'acres'

export interface PropertyAttributes {
  id: string
  companyId: string
  property_name: string
  property_type: PropertyType
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
  launch_date?: string | null
  isActive?: boolean
  isDeleted?: boolean
  createdBy?: string | null
  updatedBy?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export type PropertyCreationAttributes = Optional<
  PropertyAttributes,
  | 'id'
  | 'description'
  | 'street'
  | 'total_area'
  | 'area_unit'
  | 'amenities'
  | 'launch_date'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class Property
  extends Model<PropertyAttributes, PropertyCreationAttributes>
  implements PropertyAttributes
{
  declare id: string
  declare companyId: string
  declare property_name: string
  declare property_type: PropertyType
  declare description: string | null
  declare street: string | null
  declare city: string
  declare state: string
  declare pincode: string
  declare country: string
  declare total_area: number | null
  declare area_unit: AreaUnit | null
  declare amenities: string[] | null
  declare launch_date: string | null
  declare isActive: boolean
  declare isDeleted: boolean
  declare createdBy: string | null
  declare updatedBy: string | null
  declare readonly createdAt: Date
  declare readonly updatedAt: Date
}

Property.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
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
    property_type: {
      type: DataTypes.ENUM('apartment', 'villa', 'duplex', 'triplex'),
      allowNull: false,
      defaultValue: 'apartment',
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
    createdBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    updatedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'properties',
    timestamps: true,
  },
)
