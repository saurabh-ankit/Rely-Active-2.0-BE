import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface AmenitySlotBlockAttributes extends BaseAttributes {
  slotConfigId: string
  date: string
  startMinutes: number
  reason?: string | null
  isActive: boolean
  isDeleted: boolean
}

export type AmenitySlotBlockCreationAttributes = Optional<
  AmenitySlotBlockAttributes,
  'id' | 'reason' | 'isActive' | 'isDeleted' | 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'
>

export class AmenitySlotBlock
  extends BaseModel<AmenitySlotBlockAttributes, AmenitySlotBlockCreationAttributes>
  implements AmenitySlotBlockAttributes
{
  declare slotConfigId: string
  declare date: string
  declare startMinutes: number
  declare reason: string | null
  declare isActive: boolean
  declare isDeleted: boolean
}

AmenitySlotBlock.init(
  {
    ...baseModelColumns,
    slotConfigId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    startMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    reason: {
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
    tableName: 'amenity_slot_blocks',
    timestamps: true,
    indexes: [
      { fields: ['slotConfigId', 'date', 'startMinutes'], name: 'amenity_slot_blocks_unique', unique: true },
      { fields: ['slotConfigId', 'date', 'isDeleted'], name: 'amenity_slot_blocks_lookup_idx' },
    ],
  },
)

export default AmenitySlotBlock
