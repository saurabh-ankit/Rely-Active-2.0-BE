import { DataTypes, Optional } from 'sequelize'
import sequelize from '../config/db/index.js'
import { BaseAttributes, BaseModel, baseModelColumns } from './base.model.js'
import type { SchedulingResource } from './schedulingResource.model.js'
import type { RosterShift } from './rosterShift.model.js'
import type { RosterFrequency } from './rosterFrequency.model.js'
import type { RosterAssignmentTarget } from './rosterAssignmentTarget.model.js'

export type RosterDutyType = 'SHIFT' | 'OPD_SESSION'
export type RosterHolidayPolicy = 'IGNORE' | 'SKIP' | 'RESCHEDULE' | 'REQUIRE_COVERAGE'

export type RosterAssignmentStatus =
  | 'DRAFT'
  | 'VALIDATED'
  | 'PUBLISHED'
  | 'LOCKED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'

export interface RosterAssignmentAttributes extends BaseAttributes {
  companyId: string
  locationId: string
  rosterName: string
  dutyType?: RosterDutyType
  holidayPolicy?: RosterHolidayPolicy
  schedulingResourceId: string
  shiftId?: string | null
  slotTimeRange?: string | null
  frequencyId: string
  effectiveFrom: string
  effectiveUntil: string
  selectedWorkingDays?: string[] | null
  instructions?: string | null
  status?: RosterAssignmentStatus
  cancellationReason?: string | null
  cancelledBy?: string | null
  cancelledAt?: Date | null
  isDeleted?: boolean
}

export type RosterAssignmentCreationAttributes = Optional<
  RosterAssignmentAttributes,
  | 'id'
  | 'dutyType'
  | 'holidayPolicy'
  | 'shiftId'
  | 'slotTimeRange'
  | 'selectedWorkingDays'
  | 'instructions'
  | 'status'
  | 'cancellationReason'
  | 'cancelledBy'
  | 'cancelledAt'
  | 'isDeleted'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>

export class RosterAssignment
  extends BaseModel<RosterAssignmentAttributes, RosterAssignmentCreationAttributes>
  implements RosterAssignmentAttributes
{
  declare companyId: string
  declare locationId: string
  declare rosterName: string
  declare dutyType: RosterDutyType
  declare holidayPolicy: RosterHolidayPolicy
  declare schedulingResourceId: string
  declare shiftId: string | null
  declare slotTimeRange: string | null
  declare frequencyId: string
  declare effectiveFrom: string
  declare effectiveUntil: string
  declare selectedWorkingDays: string[] | null
  declare instructions: string | null
  declare status: RosterAssignmentStatus
  declare cancellationReason: string | null
  declare cancelledBy: string | null
  declare cancelledAt: Date | null
  declare isDeleted: boolean

  // Association properties
  declare resource?: SchedulingResource
  declare shift?: RosterShift | null
  declare frequency?: RosterFrequency
  declare targets?: RosterAssignmentTarget[]
}

RosterAssignment.init(
  {
    ...baseModelColumns,
    companyId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    locationId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    rosterName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    dutyType: {
      type: DataTypes.ENUM('SHIFT', 'OPD_SESSION'),
      allowNull: false,
      defaultValue: 'SHIFT',
    },
    holidayPolicy: {
      type: DataTypes.ENUM('IGNORE', 'SKIP', 'RESCHEDULE', 'REQUIRE_COVERAGE'),
      allowNull: false,
      defaultValue: 'SKIP',
    },
    schedulingResourceId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    shiftId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    slotTimeRange: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    frequencyId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    effectiveFrom: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    effectiveUntil: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    selectedWorkingDays: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    instructions: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('DRAFT', 'VALIDATED', 'PUBLISHED', 'LOCKED', 'ACTIVE', 'COMPLETED', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'DRAFT',
    },
    cancellationReason: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    cancelledBy: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: 'roster_assignments',
    timestamps: true,
  },
)

export default RosterAssignment
