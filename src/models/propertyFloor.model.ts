import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface PropertyFloorAttributes extends BaseAttributes {
  blockId: string
  floor_number: number
  floor_name?: string | null
  floor_type?: string | null
  is_sellable?: boolean
  description?: string | null
  isActive?: boolean
  isDeleted?: boolean
}

export type PropertyFloorCreationAttributes = Optional<
  PropertyFloorAttributes,
  | 'id'
  | 'floor_name'
  | 'floor_type'
  | 'is_sellable'
  | 'description'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class PropertyFloor
  extends BaseModel<PropertyFloorAttributes, PropertyFloorCreationAttributes>
  implements PropertyFloorAttributes
{
  declare blockId: string
  declare floor_number: number
  declare floor_name: string | null
  declare floor_type: string | null
  declare is_sellable: boolean
  declare description: string | null
  declare isActive: boolean
  declare isDeleted: boolean
}

PropertyFloor.init(
  {
    ...baseModelColumns,
    blockId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK → property_blocks.id',
    },
    floor_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '0 = Ground Floor, 1 = First Floor, etc.',
    },
    floor_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Display name e.g. "Ground Floor"',
    },
    floor_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'FLOOR',
      comment: 'FLOOR, GROUND_FLOOR, BASEMENT, STILT, PENTHOUSE',
    },
    is_sellable: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Whether floor contains sellable units',
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
  },
  {
    sequelize,
    tableName: 'property_floors',
    timestamps: true,
  },
)
