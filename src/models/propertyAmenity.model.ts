import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface PropertyAmenityAttributes extends BaseAttributes {
  propertyId: string
  amenityId: string
  slotBookable: boolean
  settings?: Record<string, unknown> | null
  isActive: boolean
  isDeleted: boolean
}

export type PropertyAmenityCreationAttributes = Optional<
  PropertyAmenityAttributes,
  'id' | 'settings' | 'isActive' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class PropertyAmenity
  extends BaseModel<PropertyAmenityAttributes, PropertyAmenityCreationAttributes>
  implements PropertyAmenityAttributes
{
  declare propertyId: string
  declare amenityId: string
  declare slotBookable: boolean
  declare settings: Record<string, unknown> | null
  declare isActive: boolean
  declare isDeleted: boolean
}

PropertyAmenity.init(
  {
    ...baseModelColumns,
    propertyId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    amenityId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    slotBookable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    settings: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'property_amenities',
    timestamps: true,
    indexes: [
      { fields: ['propertyId', 'amenityId'], name: 'property_amenities_property_amenity_unique', unique: true },
      { fields: ['propertyId', 'isDeleted'], name: 'property_amenities_property_idx' },
      { fields: ['amenityId', 'isDeleted'], name: 'property_amenities_amenity_idx' },
    ],
  },
)

export default PropertyAmenity
