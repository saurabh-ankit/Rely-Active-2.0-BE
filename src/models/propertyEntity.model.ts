import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import type { PropertyEntityType, StructureLevel } from '../enums/propertyEntity.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export type StructureLevelLabels = Partial<Record<StructureLevel, string>>

export interface PropertyEntityAttributes extends BaseAttributes {
  propertyId: string
  entity_type: PropertyEntityType
  name: string
  levels: StructureLevel[]
  level_labels?: StructureLevelLabels | null
  settings?: Record<string, unknown> | null
  sort_order?: number
  isActive?: boolean
  isDeleted?: boolean
}

export type PropertyEntityCreationAttributes = Optional<
  PropertyEntityAttributes,
  | 'id'
  | 'level_labels'
  | 'settings'
  | 'sort_order'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

/** A group of units inside a property (e.g. "Towers", "Villas") with its own structural levels. */
export class PropertyEntity
  extends BaseModel<PropertyEntityAttributes, PropertyEntityCreationAttributes>
  implements PropertyEntityAttributes
{
  declare propertyId: string
  declare entity_type: PropertyEntityType
  declare name: string
  declare levels: StructureLevel[]
  declare level_labels: StructureLevelLabels | null
  declare settings: Record<string, unknown> | null
  declare sort_order: number
  declare isActive: boolean
  declare isDeleted: boolean
}

PropertyEntity.init(
  {
    ...baseModelColumns,
    propertyId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    entity_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    levels: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    level_labels: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    settings: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
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
    tableName: 'property_entities',
    timestamps: true,
  },
)
