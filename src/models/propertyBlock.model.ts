import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'

export interface PropertyBlockAttributes {
  id: string
  propertyId: string
  block_name: string
  total_floors?: number | null
  units_per_floor?: number | null
  prefix?: string | null
  price_per_sqft?: number | null
  nomenclature_template?: string | null
  bhk_templates?: unknown | null
  description?: string | null
  isActive?: boolean
  isDeleted?: boolean
  createdBy?: string | null
  updatedBy?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export type PropertyBlockCreationAttributes = Optional<
  PropertyBlockAttributes,
  | 'id'
  | 'total_floors'
  | 'units_per_floor'
  | 'prefix'
  | 'price_per_sqft'
  | 'nomenclature_template'
  | 'bhk_templates'
  | 'description'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class PropertyBlock
  extends Model<PropertyBlockAttributes, PropertyBlockCreationAttributes>
  implements PropertyBlockAttributes
{
  declare id: string
  declare propertyId: string
  declare block_name: string
  declare total_floors: number | null
  declare units_per_floor: number | null
  declare prefix: string | null
  declare price_per_sqft: number | null
  declare nomenclature_template: string | null
  declare bhk_templates: unknown | null
  declare description: string | null
  declare isActive: boolean
  declare isDeleted: boolean
  declare createdBy: string | null
  declare updatedBy: string | null
  declare readonly createdAt: Date
  declare readonly updatedAt: Date
}

PropertyBlock.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    propertyId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK → properties.id',
    },
    block_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Block or Tower name e.g. "Block A", "Tower 1"',
    },
    total_floors: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Total number of floors in this block',
    },
    units_per_floor: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Units per floor',
    },
    prefix: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'Tower prefix e.g. "B"',
    },
    nomenclature_template: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Unit naming template e.g. {{TowerPrefix}}-{{FloorNumber}}{{Position}}',
    },
    bhk_templates: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'BHK template variants JSON array',
    },
    description: {
      type: DataTypes.TEXT,
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
    tableName: 'property_blocks',
    timestamps: true,
  },
)
