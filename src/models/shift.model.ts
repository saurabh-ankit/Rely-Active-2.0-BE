import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { SlotGenerationMode } from '../enums/roster.enum.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export interface ShiftAttributes extends BaseAttributes {
  name: string
  description: string
  startTime: string
  endTime: string
  locationId: string
  slotGenerationMode: SlotGenerationMode
  slotDuration?: number | null
  numberOfSlots?: number | null
  isActive: boolean
  isDeleted: boolean
}

export type ShiftCreationAttributes = Optional<
  ShiftAttributes,
  | 'id'
  | 'slotGenerationMode'
  | 'slotDuration'
  | 'numberOfSlots'
  | 'isActive'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class Shift extends BaseModel<ShiftAttributes, ShiftCreationAttributes> implements ShiftAttributes {
  declare name: string
  declare description: string
  declare startTime: string
  declare endTime: string
  declare locationId: string
  declare slotGenerationMode: SlotGenerationMode
  declare slotDuration: number | null
  declare numberOfSlots: number | null
  declare isActive: boolean
  declare isDeleted: boolean
}

Shift.init(
  {
    ...baseModelColumns,
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.STRING(500), allowNull: false },
    startTime: { type: DataTypes.STRING(5), allowNull: false },
    endTime: { type: DataTypes.STRING(5), allowNull: false },
    locationId: { type: DataTypes.UUID, allowNull: false },
    slotGenerationMode: {
      type: DataTypes.ENUM(...Object.values(SlotGenerationMode)),
      allowNull: false,
      defaultValue: SlotGenerationMode.AUTO_GENERATE,
    },
    slotDuration: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 60 },
    numberOfSlots: { type: DataTypes.INTEGER, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isDeleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, tableName: 'shifts', timestamps: true },
)

/** @deprecated Use Shift */
export { Shift as ShiftV2 }
export type { ShiftAttributes as ShiftV2Attributes, ShiftCreationAttributes as ShiftV2CreationAttributes }

export default Shift
