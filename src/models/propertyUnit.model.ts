import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import { OccupancyStatus, UnitAreaUnit, UnitFacing, UnitStatus, UnitType } from '../enums/propertyUnit.enum.js'

export interface PropertyUnitAttributes extends BaseAttributes {
  floorId: string
  unit_number: string
  unit_type: UnitType
  position?: number | null
  direction?: string | null
  view_facing?: string | null
  is_sellable?: boolean
  carpet_area?: number | null
  built_up_area?: number | null
  super_built_up_area?: number | null
  area_unit?: UnitAreaUnit | null
  facing?: UnitFacing | null
  price?: number | null
  price_per_sqft?: number | null
  status: UnitStatus
  occupancyStatus?: OccupancyStatus
  isActive?: boolean
  isDeleted?: boolean
}

export type PropertyUnitCreationAttributes = Optional<
  PropertyUnitAttributes,
  | 'id'
  | 'position'
  | 'direction'
  | 'view_facing'
  | 'is_sellable'
  | 'carpet_area'
  | 'built_up_area'
  | 'super_built_up_area'
  | 'area_unit'
  | 'facing'
  | 'price'
  | 'price_per_sqft'
  | 'occupancyStatus'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class PropertyUnit
  extends BaseModel<PropertyUnitAttributes, PropertyUnitCreationAttributes>
  implements PropertyUnitAttributes
{
  declare floorId: string
  declare unit_number: string
  declare unit_type: UnitType
  declare position: number | null
  declare direction: string | null
  declare view_facing: string | null
  declare is_sellable: boolean
  declare carpet_area: number | null
  declare built_up_area: number | null
  declare super_built_up_area: number | null
  declare area_unit: UnitAreaUnit | null
  declare facing: UnitFacing | null
  declare price: number | null
  declare price_per_sqft: number | null
  declare status: UnitStatus
  declare occupancyStatus: OccupancyStatus
  declare isActive: boolean
  declare isDeleted: boolean
}

PropertyUnit.init(
  {
    ...baseModelColumns,
    floorId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK -> property_floors.id',
    },
    unit_number: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Unit / Flat number e.g. "101", "A-201"',
    },
    unit_type: {
      type: DataTypes.ENUM('1BHK', '2BHK', '3BHK', '4BHK', 'studio', 'penthouse', 'shop', 'office'),
      allowNull: false,
      defaultValue: '2BHK',
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    direction: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    view_facing: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    is_sellable: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    carpet_area: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    built_up_area: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    super_built_up_area: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    area_unit: {
      type: DataTypes.ENUM('sqft', 'sqmt', 'acres'),
      allowNull: true,
      defaultValue: 'sqft',
    },
    facing: {
      type: DataTypes.ENUM('north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest'),
      allowNull: true,
    },
    price: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
    },
    price_per_sqft: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('available', 'booked', 'sold', 'on_hold'),
      allowNull: false,
      defaultValue: 'available',
    },
    occupancyStatus: {
      type: DataTypes.ENUM('VACANT', 'OWNER_OCCUPIED', 'TENANT_OCCUPIED'),
      allowNull: false,
      defaultValue: 'VACANT',
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
    tableName: 'property_units',
    timestamps: true,
  },
)

export default PropertyUnit
