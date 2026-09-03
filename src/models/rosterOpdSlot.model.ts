import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'

export type OpdSlotStatus = 'AVAILABLE' | 'PARTIALLY_BOOKED' | 'FULL' | 'BLOCKED' | 'CANCELLED'

export interface RosterOpdSlotAttributes extends BaseAttributes {
  rosterAssignmentDateId: string
  slotNumber: number
  scheduledStart: Date
  scheduledEnd: Date
  maxCapacity?: number
  bookedCount?: number
  status?: OpdSlotStatus
  activeToken?: string
  isDeleted?: boolean
}

export type RosterOpdSlotCreationAttributes = Optional<
  RosterOpdSlotAttributes,
  | 'id'
  | 'maxCapacity'
  | 'bookedCount'
  | 'status'
  | 'activeToken'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class RosterOpdSlot
  extends BaseModel<RosterOpdSlotAttributes, RosterOpdSlotCreationAttributes>
  implements RosterOpdSlotAttributes
{
  declare rosterAssignmentDateId: string
  declare slotNumber: number
  declare scheduledStart: Date
  declare scheduledEnd: Date
  declare maxCapacity: number
  declare bookedCount: number
  declare status: OpdSlotStatus
  declare activeToken: string
  declare isDeleted: boolean
}

RosterOpdSlot.init(
  {
    ...baseModelColumns,
    rosterAssignmentDateId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    slotNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    scheduledStart: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    scheduledEnd: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    maxCapacity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    bookedCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.ENUM('AVAILABLE', 'PARTIALLY_BOOKED', 'FULL', 'BLOCKED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'AVAILABLE',
    },
    activeToken: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'roster_opd_slots',
    timestamps: true,
  },
)

export default RosterOpdSlot
