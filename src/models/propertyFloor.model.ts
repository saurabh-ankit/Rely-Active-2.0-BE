import { DataTypes, Model, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'

export interface PropertyFloorAttributes {
  id: string
  blockId: string
  floor_number: number
  floor_name?: string | null
  floor_type?: string | null
  is_sellable?: boolean
  description?: string | null
  isActive?: boolean
  isDeleted?: boolean
  createdBy?: string | null
  updatedBy?: string | null
  createdAt?: Date
  updatedAt?: Date
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
  extends Model<PropertyFloorAttributes, PropertyFloorCreationAttributes>
  implements PropertyFloorAttributes
{
  declare id: string
  declare blockId: string
  declare floor_number: number
  declare floor_name: string | null
  declare floor_type: string | null
  declare is_sellable: boolean
  declare description: string | null
  declare isActive: boolean
  declare isDeleted: boolean
  declare createdBy: string | null
  declare updatedBy: string | null
  declare readonly createdAt: Date
  declare readonly updatedAt: Date
}

PropertyFloor.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
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
    tableName: 'property_floors',
    timestamps: true,
  },
)
