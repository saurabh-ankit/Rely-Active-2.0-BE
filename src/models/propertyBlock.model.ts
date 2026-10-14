import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface PropertyBlockAttributes extends BaseAttributes {
  propertyId: string
  entityId?: string | null
  /** Hidden block created for entities that don't use blocks. */
  is_virtual?: boolean
  block_name: string
  total_floors?: number | null
  units_per_floor?: number | null
  prefix?: string | null
  price_per_sqft?: number | null
  nomenclature_template?: string | null
  bhk_templates?: unknown | null
  /** Order inside the entity; group unit numbers run in this order. */
  sort_order?: number
  description?: string | null
  isActive?: boolean
  isDeleted?: boolean
}

export type PropertyBlockCreationAttributes = Optional<
  PropertyBlockAttributes,
  | 'id'
  | 'entityId'
  | 'is_virtual'
  | 'total_floors'
  | 'units_per_floor'
  | 'prefix'
  | 'price_per_sqft'
  | 'nomenclature_template'
  | 'bhk_templates'
  | 'sort_order'
  | 'description'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class PropertyBlock
  extends BaseModel<PropertyBlockAttributes, PropertyBlockCreationAttributes>
  implements PropertyBlockAttributes
{
  declare propertyId: string
  declare entityId: string | null
  declare is_virtual: boolean
  declare block_name: string
  declare total_floors: number | null
  declare units_per_floor: number | null
  declare prefix: string | null
  declare price_per_sqft: number | null
  declare nomenclature_template: string | null
  declare bhk_templates: unknown | null
  declare sort_order: number
  declare description: string | null
  declare isActive: boolean
  declare isDeleted: boolean
}

PropertyBlock.init(
  {
    ...baseModelColumns,
    propertyId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK → properties.id',
    },
    entityId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    is_virtual: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
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
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
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
  },
  {
    sequelize,
    tableName: 'property_blocks',
    timestamps: true,
  },
)
