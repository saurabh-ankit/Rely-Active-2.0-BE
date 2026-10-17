import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface AmenitySlotConfigAttributes extends BaseAttributes {
  propertyAmenityId: string
  openMinutes: number
  closeMinutes: number
  durationMin: number
  capacity: number
  daysOfWeek: number[]
  isActive: boolean
  isDeleted: boolean
}

export type AmenitySlotConfigCreationAttributes = Optional<
  AmenitySlotConfigAttributes,
  'id' | 'daysOfWeek' | 'isActive' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class AmenitySlotConfig
  extends BaseModel<AmenitySlotConfigAttributes, AmenitySlotConfigCreationAttributes>
  implements AmenitySlotConfigAttributes
{
  declare propertyAmenityId: string
  declare openMinutes: number
  declare closeMinutes: number
  declare durationMin: number
  declare capacity: number
  declare daysOfWeek: number[]
  declare isActive: boolean
  declare isDeleted: boolean
}

AmenitySlotConfig.init(
  {
    ...baseModelColumns,
    propertyAmenityId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    openMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    closeMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    durationMin: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    capacity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    daysOfWeek: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [0, 1, 2, 3, 4, 5, 6],
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
    tableName: 'amenity_slot_configs',
    timestamps: true,
    indexes: [
      { fields: ['propertyAmenityId'], name: 'amenity_slot_configs_property_amenity_unique', unique: true },
      { fields: ['isDeleted'], name: 'amenity_slot_configs_deleted_idx' },
    ],
  },
)

export default AmenitySlotConfig
