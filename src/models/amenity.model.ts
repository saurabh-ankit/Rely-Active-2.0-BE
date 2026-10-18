import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface AmenityAttributes extends BaseAttributes {
  name: string
  description?: string | null
  isActive: boolean
  isDeleted: boolean
}

export type AmenityCreationAttributes = Optional<
  AmenityAttributes,
  'id' | 'description' | 'isActive' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class Amenity extends BaseModel<AmenityAttributes, AmenityCreationAttributes> implements AmenityAttributes {
  declare name: string
  declare description: string | null
  declare isActive: boolean
  declare isDeleted: boolean
}

Amenity.init(
  {
    ...baseModelColumns,
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(500),
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
    tableName: 'amenities',
    timestamps: true,
    indexes: [
      { fields: ['name'], name: 'amenities_name_unique', unique: true },
      { fields: ['isActive', 'isDeleted'], name: 'amenities_active_idx' },
    ],
  },
)

export default Amenity
